window.__ModuleLoader__.load({
  id: "dsh-claude-usage",
  factory: (require) => {
    const React = require("react");
    const h = React.createElement;
    const NS = "claudeUsage";
    const en = {
      title: "Usage", remaining: "remaining", fiveHour: "5h", weekly: "Weekly",
      remainingFiveHour: "remaining (5h)", remainingWeekly: "remaining (weekly)",
      loading: "Loading usage…", unavailable: "Usage unavailable", "signed-out": "Sign in through a provider",
      "sign-in-required": "Check your provider sign-in", "rate-limited": "Usage check rate-limited; retrying shortly",
      resets: "Resets", updated: "Updated", low: "Low", critical: "Critical",
      hint: "Account-wide remaining allowance for each signed-in provider. Refreshes every minute. Unreported windows are hidden.",
    };
    const zh = {
      title: "额度", remaining: "剩余", fiveHour: "5小时", weekly: "每周",
      remainingFiveHour: "剩余（5小时）", remainingWeekly: "剩余（每周）",
      loading: "正在加载额度…", unavailable: "额度暂不可用", "signed-out": "请先登录供应商",
      "sign-in-required": "请检查供应商登录状态", "rate-limited": "额度查询受限，稍后自动重试",
      resets: "重置时间", updated: "更新时间", low: "偏低", critical: "即将耗尽",
      hint: "各已登录供应商账号共享的剩余额度，每分钟刷新一次。未提供的额度窗口会隐藏。",
    };
    const states = new Set(["ready", "unavailable", "signed-out", "sign-in-required", "rate-limited"]);
    const schema = { parse(value) {
      if (!value || !states.has(value.state) || !Array.isArray(value.limits) ||
          !(value.fetchedAt === null || Number.isFinite(value.fetchedAt))) throw new TypeError("Invalid usage result");
      for (const limit of value.limits) {
        if (!limit || typeof limit.id !== "string" || typeof limit.name !== "string") throw new TypeError("Invalid usage limit");
        for (const window of [limit.fiveHour, limit.weekly]) {
          if (window === null) continue;
          if (!window || !Number.isFinite(window.remainingPercent) || window.remainingPercent < 0 || window.remainingPercent > 100 ||
              !(window.resetsAt === null || (Number.isSafeInteger(window.resetsAt) && window.resetsAt > 0))) throw new TypeError("Invalid usage window");
        }
      }
      return value;
    } };
    const descriptor = {
      package: "dsh-claude-usage",
      descriptors: [{ id: "dsh-claude-usage#claudeUsage/read", service: "claudeUsage", namespace: "claudeUsage", method: "read",
        invocation: { kind: "direct" }, parameters: [],
        result: { mode: "strict", typeSymbol: "dsh-claude-usage#claudeUsage/read:result", schema,
          create: () => schema } }],
    };
    function useUsage(api) {
      const [data, setData] = React.useState(null);
      React.useEffect(() => {
        let active = true;
        let running = false;
        const refresh = async () => {
          if (!active || running) return;
          running = true;
          try {
            const response = await api.read();
            if (!response?.ok) throw new Error("Usage request failed");
            const result = schema.parse(response.value);
            if (active) setData(result);
          } catch {
            if (active) setData({ state: "unavailable", fetchedAt: null, limits: [] });
          } finally {
            running = false;
          }
        };
        const visible = () => { if (document.visibilityState === "visible") void refresh(); };
        const interval = setInterval(visible, 60000);
        document.addEventListener("visibilitychange", visible);
        window.addEventListener("online", visible);
        void refresh();
        return () => {
          active = false;
          clearInterval(interval);
          document.removeEventListener("visibilitychange", visible);
          window.removeEventListener("online", visible);
        };
      }, [api]);
      return { data };
    }
    const color = "var(--dsw-alias-label-primary)";
    const muted = "var(--dsw-alias-label-tertiary)";

    /** A figure this stale, or a window already past its reset, reads as unknown. */
    function amount(window, data) {
      if (!window || !data?.fetchedAt || Date.now() - data.fetchedAt > 90000 ||
          (window.resetsAt && window.resetsAt * 1000 <= Date.now())) return "—";
      return `${Math.round(window.remainingPercent * 10) / 10}%`;
    }
    const date = (seconds) => new Date(seconds * 1000).toLocaleString();
    function severityOf(window, value) {
      if (value === "—") return null;
      return window.remainingPercent <= 10 ? "critical" : window.remainingPercent <= 25 ? "low" : null;
    }
    const fillOf = (severity) => severity === "critical" ? "light-dark(#b5324d, #ff8096)"
      : severity === "low" ? "light-dark(#92600d, #efb84f)" : "light-dark(#267843, #6fce91)";
    function relativeReset(resetsAt) {
      const seconds = resetsAt ? resetsAt - Date.now() / 1000 : 0;
      if (seconds <= 0) return null;
      const unit = seconds >= 86400 ? "day" : seconds >= 3600 ? "hour" : "minute";
      const divisor = unit === "day" ? 86400 : unit === "hour" ? 3600 : 60;
      return new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(Math.ceil(seconds / divisor), unit);
    }

    /**
     * One provider's block: its name, then a meter per reported window.
     *
     * The panel is content-sized rather than resizable. The sidebar footer is a
     * single horizontal row, so a fixed tall panel next to a second one only
     * ever produced blank space and a panel pushed off the edge.
     */
    function ProviderRow({ limit, data, t }) {
      const windows = [["fiveHour", limit.fiveHour], ["weekly", limit.weekly]].filter(([, window]) => window != null);
      if (windows.length === 0) return null;
      return h("div", { style: { marginTop: 12 } },
        h("div", { style: { fontSize: 13, fontWeight: 650, marginBottom: 6 } }, limit.name),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 16 } },
          ...windows.map(([key, window]) => {
            const value = amount(window, data);
            const valid = value !== "—";
            const severity = severityOf(window, value);
            const fill = fillOf(severity);
            const reset = relativeReset(window.resetsAt);
            return h("div", { key, style: { flex: "1 1 104px", minWidth: 0 } },
              h("div", { style: { fontSize: 24, fontWeight: 650, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" } }, value),
              h("div", { style: { fontSize: 12, lineHeight: 1.5, marginBottom: 6 } }, t(key === "fiveHour" ? "remainingFiveHour" : "remainingWeekly")),
              h("div", { ...(valid ? { role: "progressbar", "aria-label": `${limit.name} ${t(key)} ${t("remaining")}`, "aria-valuenow": window.remainingPercent, "aria-valuemin": 0, "aria-valuemax": 100 } : {}),
                style: { height: 8, borderRadius: 3, overflow: "hidden", background: "light-dark(#d3d8df, #4b515c)" } },
                valid && h("div", { style: { height: "100%", width: `${window.remainingPercent}%`, background: fill } })),
              severity && h("div", { style: { marginTop: 4, fontSize: 12, fontWeight: 650, color: fill } }, t(severity)),
              reset && h("div", { title: date(window.resetsAt), style: { marginTop: 4, fontSize: 12, lineHeight: 1.4, color: muted } }, `${t("resets")} ${reset}`));
          }))
      );
    }

    function Summary({ api, t, wide }) {
      const { data } = useUsage(api);
      const limits = (data?.limits ?? []).filter(limit => limit.fiveHour || limit.weekly);
      const state = data?.state ?? "loading";
      const title = [t("title"), ...limits.flatMap(limit =>
        [["fiveHour", limit.fiveHour], ["weekly", limit.weekly]]
          .filter(([, window]) => window != null)
          .map(([key, window]) => `${limit.name} ${t(key)} ${amount(window, data)} ${t("remaining")}`))].join("\n");

      if (wide === false) {
        // Rail: the panel collapses to the headline figures only.
        return h("div", { title, "aria-label": title,
          style: { color, background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6, padding: "7px 2px", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" } },
          ...limits.slice(0, 2).map(limit => h("div", { key: limit.id }, amount(limit.fiveHour ?? limit.weekly, data))),
          limits.length === 0 && h("div", null, "—"));
      }

      return h("section", { "aria-label": title,
        style: { color, lineHeight: 1.5, flexShrink: 0, background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: "12px 12px 14px", margin: "4px 0 10px", width: "100%", minWidth: 0, boxSizing: "border-box" } },
        h("div", { style: { fontSize: 15, fontWeight: 650 } }, t("title")),
        state !== "ready"
          ? h("div", { role: "status", style: { fontSize: 13, marginTop: 6 } }, t(state))
          : limits.length === 0
            ? h("div", { role: "status", style: { fontSize: 13, marginTop: 6 } }, t("unavailable"))
            : limits.map(limit => h(ProviderRow, { key: limit.id, limit, data, t })));
    }

    function Panel({ api, t }) {
      const { data } = useUsage(api);
      const limits = (data?.limits ?? []).filter(limit => limit.fiveHour || limit.weekly);
      return h("section", { style: { color, padding: 16, fontSize: 13 } },
        h("h2", null, t("title")), h("p", { style: { color: muted } }, t("hint")),
        data?.state !== "ready" ? h("p", { role: "status" }, t(data?.state ?? "loading")) :
          limits.length === 0 ? h("p", { role: "status" }, t("unavailable")) :
            limits.map(limit => h("div", { key: limit.id, style: { margin: "16px 0", padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 } },
              h("strong", null, limit.name),
              ...[["fiveHour", limit.fiveHour], ["weekly", limit.weekly]].filter(([, window]) => window != null).map(([key, window]) =>
                h("div", { key, style: { marginTop: 10 } },
                  h("div", null, `${t(key)}: ${amount(window, data)} ${t("remaining")}`),
                  amount(window, data) !== "—" && h("progress", { max: 100, value: window.remainingPercent, "aria-label": `${limit.name} ${t(key)} ${t("remaining")}`, style: { width: "100%", accentColor: "var(--dsw-alias-brand-primary)" } }),
                  window?.resetsAt && h("small", { style: { color: muted } }, `${t("resets")}: ${date(window.resetsAt)}`))))),
        data?.fetchedAt && h("p", { style: { color: muted } }, `${t("updated")}: ${new Date(data.fetchedAt).toLocaleTimeString()}`));
    }

    async function apply(ctx) {
      const unmount = await ctx.remote.$mount(descriptor);
      ctx.effect(() => ctx.locale.register(NS, { en, zh }));
      const t = ctx.locale.bind(NS);
      ctx.inject(["remote.claudeUsage"], scope => {
        const inject = () => ({ api: scope.remote.claudeUsage });
        scope.slots.inject("sidebar.footer.action", () => scope.slots.register({ name: "sidebar.footer.action", id: "usage", order: 30, locale: NS, inject }, Summary));
        scope.slots.inject("settings.section", () => scope.slots.register({ name: "settings.section", id: "usage", order: 16, label: () => t("title"), locale: NS, inject }, Panel));
      });
      return unmount;
    }
    return { apply, inject: ["slots", "locale", "remote"] };
  },
});
