/**
 * Normalizing and fetching Claude's usage windows.
 *
 * `GET /api/oauth/usage` reports how much of each allowance has been USED, in
 * percent, for the rolling five-hour and seven-day windows — the same two the
 * Codex companion shows. Only quota figures leave this module: no account id,
 * no token, no upstream error body.
 */

/** The credential this companion reads, owned by dsh-claude-provider's sign-in. */
export const PROVIDER_SCOPE = "llm-pi-ai";
export const PROVIDER_ID = "anthropic";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

/** Extra weekly allowances Anthropic reports beside the account-wide one. */
const EXTRA_WEEKLY = [
  ["seven_day_opus", "claude-opus", "Opus"],
  ["seven_day_sonnet", "claude-sonnet", "Sonnet"],
  ["seven_day_oauth_apps", "claude-oauth-apps", "OAuth apps"],
];

function windowOf(source) {
  if (!source || typeof source !== "object") return null;
  const used = source.utilization;
  if (typeof used !== "number" || !Number.isFinite(used)) return null;
  const reset = typeof source.resets_at === "string" ? Date.parse(source.resets_at) : Number.NaN;
  return {
    remainingPercent: Math.max(0, Math.min(100, 100 - used)),
    resetsAt: Number.isFinite(reset) ? Math.round(reset / 1000) : null,
  };
}

/**
 * Turn the usage document into the window shape the widget renders.
 * @param payload - the parsed response body.
 * @returns one limit per reported allowance; extra windows only when present.
 */
export function parseUsage(payload) {
  if (!payload || typeof payload !== "object") throw new TypeError("Unexpected usage response");
  const primary = windowOf(payload.five_hour);
  const weekly = windowOf(payload.seven_day);
  if (primary === null && weekly === null) throw new TypeError("Unexpected usage response");
  const limits = [{ id: "claude", name: "Claude", fiveHour: primary, weekly }];
  for (const [field, id, name] of EXTRA_WEEKLY) {
    const window = windowOf(payload[field]);
    if (window !== null) limits.push({ id, name, fiveHour: null, weekly: window });
  }
  return limits;
}

/**
 * One shared, coalesced reader.
 *
 * The token lives in a credential *record* rather than an env-style reference,
 * because that is where the harness adapter keeps the OAuth grant it refreshes.
 * Reads are cached for half a minute and discarded whenever the stored token
 * changes, so a re-sign-in is reflected immediately and never mixed with the
 * previous account's numbers.
 *
 * @param options - credential resolver, transport, and cache knobs.
 * @returns `read()` plus `dispose()`.
 */
export function createUsageReader({
  resolveCredential,
  fetchUsage = fetch,
  now = Date.now,
  cacheMs = 30000,
  timeoutMs = 10000,
}) {
  const lifetime = new AbortController();
  let pending = null;
  let cached = null;
  let cachedToken = null;
  let nextRead = 0;
  const empty = (state) => ({ state, fetchedAt: null, limits: [] });

  async function readOnce() {
    let token;
    try {
      token = await resolveCredential();
    } catch {
      return empty("unavailable");
    }
    if (!token) {
      cached = null;
      cachedToken = null;
      return empty("signed-out");
    }
    if (token === cachedToken && cached && now() < nextRead) return cached;
    cachedToken = token;
    cached = null;

    let result;
    try {
      const response = await fetchUsage(USAGE_URL, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20,claude-code-20250219",
          "user-agent": "claude-cli/2.0.0 (external, cli)",
          "x-app": "cli",
          accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (response.status === 401 || response.status === 403) result = empty("sign-in-required");
      else if (response.status === 429) result = empty("rate-limited");
      else if (!response.ok) result = empty("unavailable");
      else result = { state: "ready", fetchedAt: now(), limits: parseUsage(await response.json()) };
    } catch {
      result = empty("unavailable");
    }
    if (lifetime.signal.aborted) return empty("unavailable");

    let current;
    try {
      current = await resolveCredential();
    } catch {
      return empty("unavailable");
    }
    if (current !== token) return empty(current ? "unavailable" : "signed-out");

    cached = result;
    nextRead = now() + (result.state === "rate-limited" ? Math.max(cacheMs, 60000) : cacheMs);
    return result;
  }

  return {
    read() {
      if (lifetime.signal.aborted) return Promise.resolve(empty("unavailable"));
      if (!pending) {
        pending = readOnce().finally(() => {
          pending = null;
        });
      }
      return pending;
    },
    async dispose() {
      lifetime.abort();
      await pending;
      cached = null;
      cachedToken = null;
    },
  };
}

/** The OpenAI token, written by dsh-codex-provider for the same route. */
export const CODEX_KEY_REF = "OPENAI_CODEX_API_KEY";
/** Codex usage, as the Codex companion reads it. */
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
/** JWT claim carrying the ChatGPT account the request is scoped to. */
const OPENAI_CLAIM_PATH = "https://api.openai.com/auth";

/** The account id the Codex usage endpoint scopes to; null for a non-JWT token. */
export function codexAccountId(access) {
  try {
    const claims = JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString("utf8"));
    const id = claims?.[OPENAI_CLAIM_PATH]?.chatgpt_account_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function codexWindow(source, seconds) {
  if (!source || typeof source !== "object") return null;
  if (source.limit_window_seconds !== seconds) return null;
  if (typeof source.used_percent !== "number" || !Number.isFinite(source.used_percent)) return null;
  return {
    remainingPercent: Math.max(0, Math.min(100, 100 - source.used_percent)),
    resetsAt: Number.isSafeInteger(source.reset_at) && source.reset_at > 0 ? source.reset_at : null,
  };
}

/**
 * Normalize the Codex usage document into the same window shape.
 * @param payload - the parsed response body.
 * @returns one limit per reported meter.
 */
export function parseCodexUsage(payload) {
  if (!payload || typeof payload !== "object" || !("rate_limit" in payload)) {
    throw new TypeError("Unexpected Codex usage response");
  }
  const meters = [{ id: "codex", name: "Codex", rate: payload.rate_limit }];
  if (Array.isArray(payload.additional_rate_limits)) {
    for (const item of payload.additional_rate_limits) {
      if (item && typeof item.metered_feature === "string") {
        meters.push({
          id: item.metered_feature,
          name: typeof item.limit_name === "string" ? item.limit_name : item.metered_feature,
          rate: item.rate_limit,
        });
      }
    }
  }
  return meters.map(({ id, name, rate }) => ({
    id,
    name,
    fiveHour: codexWindow(rate?.primary_window, 18000) ?? codexWindow(rate?.secondary_window, 18000),
    weekly: codexWindow(rate?.secondary_window, 604800) ?? codexWindow(rate?.primary_window, 604800),
  }));
}

/**
 * Reader for the Codex allowance, which scopes requests by the JWT account id.
 * @param options - credential resolver, transport, and cache knobs.
 * @returns `read()` plus `dispose()`.
 */
export function createCodexUsageReader({ resolveCredential, fetchUsage = fetch, now = Date.now, cacheMs = 30000, timeoutMs = 10000 }) {
  const lifetime = new AbortController();
  let pending = null;
  let cached = null;
  let cachedToken = null;
  let nextRead = 0;
  const empty = (state) => ({ state, fetchedAt: null, limits: [] });

  async function readOnce() {
    let token;
    try { token = await resolveCredential(); } catch { return empty("unavailable"); }
    if (!token) { cached = null; cachedToken = null; return empty("signed-out"); }
    if (token === cachedToken && cached && now() < nextRead) return cached;
    cachedToken = token;
    cached = null;
    const account = codexAccountId(token);
    if (!account) return empty("sign-in-required");
    let result;
    try {
      const response = await fetchUsage(CODEX_USAGE_URL, {
        method: "GET",
        headers: { authorization: `Bearer ${token}`, "chatgpt-account-id": account, accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (response.status === 401 || response.status === 403) result = empty("sign-in-required");
      else if (response.status === 429) result = empty("rate-limited");
      else if (!response.ok) result = empty("unavailable");
      else result = { state: "ready", fetchedAt: now(), limits: parseCodexUsage(await response.json()) };
    } catch {
      result = empty("unavailable");
    }
    if (lifetime.signal.aborted) return empty("unavailable");
    let current;
    try { current = await resolveCredential(); } catch { return empty("unavailable"); }
    if (current !== token) return empty(current ? "unavailable" : "signed-out");
    cached = result;
    nextRead = now() + (result.state === "rate-limited" ? Math.max(cacheMs, 60000) : cacheMs);
    return result;
  }

  return {
    read() {
      if (lifetime.signal.aborted) return Promise.resolve(empty("unavailable"));
      if (!pending) pending = readOnce().finally(() => { pending = null; });
      return pending;
    },
    async dispose() { lifetime.abort(); await pending; cached = null; cachedToken = null; },
  };
}