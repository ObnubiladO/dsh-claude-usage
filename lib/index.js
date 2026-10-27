import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { createCodexUsageReader, createUsageReader, CODEX_KEY_REF, PROVIDER_ID, PROVIDER_SCOPE } from "./usage.js";
import z from "@deepseek-ai/schemastery";

let markRead;
Remote("read")(undefined, { private: false, static: false, name: "read", addInitializer(fn) { markRead = fn; } });

/**
 * Read-only companion; dsh-claude-provider (via the pi-ai adapter) retains sole
 * ownership of the OAuth grant and its refresh.
 *
 * The provider plugin is deliberately NOT injected. This companion reads the
 * credential record and fetches usage with its own HTTP client, so a runtime
 * that skips the provider bundle shows an unavailable panel instead of making
 * the whole entry pending.
 */
export default class ClaudeUsage extends TypertRemoteService {
  static inject = ["credentials", "settings"];
  static Config = z.object({ sidebarHeight: z.number().min(140).max(400).default(220).volatile() });

  constructor(ctx, config) {
    super(ctx, "claudeUsage");
    markRead.call(this);
    this.config = config;
    // The sidebar height is written by the client's own panel through
    // `settings.mutate`, so the generated form stays out of Settings.
    ctx.inject(["settings"], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)); });
    const key = credentialKey(PROVIDER_SCOPE, PROVIDER_ID);
    this.reader = createUsageReader({
      resolveCredential: async () => {
        // The grant lives in the scoped record the adapter refreshes; the raw
        // access token never crosses the RPC boundary.
        const credentials = ctx.get("credentials");
        if (credentials === undefined) return null;
        const record = await credentials.readRecord(key);
        const access = record?.kind === "grant" ? record.payload?.access : undefined;
        return typeof access === "string" && access.length > 0 ? access : null;
      },
    });
    this.codexReader = createCodexUsageReader({
      resolveCredential: async () => {
        const credentials = ctx.get("credentials");
        if (credentials === undefined) return null;
        const resolved = await credentials.resolve(CODEX_KEY_REF);
        return typeof resolved?.value === "string" && resolved.value.length > 0 ? resolved.value : null;
      },
    });
    ctx.effect(() => () => {
      this.reader.dispose();
      this.codexReader.dispose();
    });
  }

  /**
   * Both providers' allowances in one panel.
   *
   * The sidebar footer is a single horizontal row, so a second full-width panel
   * cannot stack beside the Codex one — it overflows instead. This service
   * therefore reports both, and the panel renders Codex above Claude, matching
   * the "one page per area" shape the Providers section already uses.
   *
   * `providers` carries one entry per provider *whether or not it answered*, so
   * a transient failure is shown against that provider instead of deleting it
   * from the panel — a provider that vanished mid-session reads as a bug even
   * when it is only a rate-limited usage check.
   *
   * @returns per-provider entries, a merged state, and the panel height.
   */
  async read() {
    const [claude, codex] = await Promise.all([this.reader.read(), this.codexReader.read()]);
    const providers = [
      { id: "codex", name: "Codex", state: codex.state, limits: codex.limits, fetchedAt: codex.fetchedAt },
      { id: "claude", name: "Claude", state: claude.state, limits: claude.limits, fetchedAt: claude.fetchedAt },
    ];
    const limits = [...codex.limits, ...claude.limits];
    const states = [codex.state, claude.state];
    // Ready wins when either provider answered; otherwise report the most
    // actionable state so the panel can say what is needed.
    const state = states.includes("ready")
      ? "ready"
      : states.includes("rate-limited") ? "rate-limited"
        : states.includes("sign-in-required") ? "sign-in-required"
          : states.includes("unavailable") ? "unavailable"
            : "signed-out";
    const stamps = [codex.fetchedAt, claude.fetchedAt].filter((value) => Number.isFinite(value));
    return {
      state,
      fetchedAt: stamps.length > 0 ? Math.max(...stamps) : null,
      limits,
      providers,
      sidebarHeight: this.config.sidebarHeight.get(),
    };
  }
}
