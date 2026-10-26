import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { createUsageReader, PROVIDER_ID, PROVIDER_SCOPE } from "./usage.js";
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
    ctx.effect(() => () => this.reader.dispose());
  }

  async read() {
    return { ...await this.reader.read(), sidebarHeight: this.config.sidebarHeight.get() };
  }
}
