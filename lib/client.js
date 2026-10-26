window.__ModuleLoader__.load({
  id: "dsh-claude-usage",
  factory: (require) => {
    const React = require("react");
    const h = React.createElement;
    const NS = "claudeUsage";
    const emptyModelStore = { getSnapshot: () => null, subscribe: () => () => {} };
    const en = {
      resize: "Resize usage indicator. Drag up to expand; drag down to shrink. Arrow keys resize; Home and End select minimum and maximum.", sizeNotSaved: "Size could not be saved",
      remainingFiveHour: "remaining (5h)", remainingWeekly: "remaining (weekly)", low: "Low", critical: "Critical",
      title: "Claude usage", remaining: "remaining", fiveHour: "5h", weekly: "Weekly",
      loading: "Loading usage…", unavailable: "Usage unavailable", "signed-out": "Sign in through Claude Provider",
      "sign-in-required": "Check your Claude Provider sign-in", "rate-limited": "Usage check rate-limited; retrying shortly",
      resets: "Resets", updated: "Updated", hint: "Account-wide remaining allowance. Refreshes every minute. Unreported windows are hidden.",
    };
    const zh = {
      resize: "调整额度面板高度。向上拖动展开，向下拖动缩小。方向键调整，Home 和 End 设置最小和最大高度。", sizeNotSaved: "无法保存高度",
      remainingFiveHour: "剩余（5小时）", remainingWeekly: "剩余（每周）", low: "偏低", critical: "即将耗尽",
      title: "Claude 额度", remaining: "剩余", fiveHour: "5小时", weekly: "每周",
      loading: "正在加载额度…", unavailable: "额度暂不可用", "signed-out": "请通过 Claude Provider 登录",
      "sign-in-required": "请检查 Claude Provider 登录状态", "rate-limited": "额度查询受限，稍后自动重试",
      resets: "重置时间", updated: "更新时间", hint: "账号共享的剩余额度，每分钟刷新一次。未提供的额度窗口会隐藏。",
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
    function amount(window, data) {
      if (!window || !data?.fetchedAt || Date.now() - data.fetchedAt > 90000 ||
          (window.resetsAt && window.resetsAt * 1000 <= Date.now())) return "—";
      return `${Math.round(window.remainingPercent * 10) / 10}%`;
    }
    const date = (seconds) => new Date(seconds * 1000).toLocaleString();

    /**
     * Which allowance the selected model draws from. A model-specific weekly
     * window is reported only for some plans, so the account-wide one is the
     * fallback whenever the specific figure is missing.
     */
    function allowanceFor(selected, limits) {
      const isClaude = selected?.provider === "anthropic";
      const model = isClaude && typeof selected.model === "string" ? selected.model.toLowerCase() : "";
      const specific = model.includes("opus") ? { id: "claude-opus", label: "Claude Opus" }
        : model.includes("sonnet") ? { id: "claude-sonnet", label: "Claude Sonnet" }
          : null;
      if (specific !== null) {
        const quota = limits.find(limit => limit.id === specific.id);
        if (quota && (quota.fiveHour || quota.weekly)) return { label: specific.label, quota };
      }
      return { label: "Claude", quota: limits.find(limit => limit.id === "claude") };
    }

    function Summary({ api, t, wide, useSessions, models, sessions, settings }) {
      const { data } = useUsage(api);
      const [height, setHeight] = React.useState(220);
      const [saveError, setSaveError] = React.useState(false);
      const drag = React.useRef(null);
      const heightRef = React.useRef(220);
      const touched = React.useRef(false);
      const saves = React.useRef(Promise.resolve());
      const clampHeight = value => Math.max(180, Math.min(240, Math.round(value)));
      React.useEffect(() => {
        if (!touched.current && Number.isFinite(data?.sidebarHeight)) {
          heightRef.current = clampHeight(data.sidebarHeight);
          setHeight(heightRef.current);
        }
      }, [data?.sidebarHeight]);
      function changeHeight(value) {
        touched.current = true;
        heightRef.current = clampHeight(value);
        setHeight(heightRef.current);
      }
      function saveHeight() {
        const value = heightRef.current;
        saves.current = saves.current.then(async () => {
          try {
            const result = await settings.mutate("claude-usage", [{ op: "set", path: ["sidebarHeight"], value }], undefined);
            setSaveError(!result.ok);
          } catch { setSaveError(true); }
        });
      }
      const sessionId = useSessions(state => state.current);
      const store = React.useMemo(() => sessionId && sessions.binding(sessionId)
        ? models.directoryFor(sessionId).store : emptyModelStore, [sessionId, models, sessions]);
      const subscribe = React.useCallback(listener => store.subscribe(listener), [store]);
      const snapshot = React.useCallback(() => store.getSnapshot()?.current ?? null, [store]);
      const selected = React.useSyncExternalStore(subscribe, snapshot, snapshot);
      const allowance = allowanceFor(selected, data?.limits ?? []);
      const quota = allowance.quota;
      const windows = [["fiveHour", quota?.fiveHour], ["weekly", quota?.weekly]].filter(([, window]) => window != null);
      const line = windows.map(([key, window]) => `${t(key)} ${amount(window, data)}`).join(" · ");
      const title = [allowance.label, data?.state === "ready" && windows.length ? `${line} ${t("remaining")}` : t(data?.state === "ready" ? "unavailable" : data?.state ?? "loading"),
        ...[quota?.fiveHour, quota?.weekly].filter(window => window?.resetsAt).map(window => `${t("resets")}: ${date(window.resetsAt)}`)].join("\n");
      if (wide === false) return h("div", { title, "aria-label": title,
        style: { color, background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6, padding: "7px 2px", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" } },
        "Claude", ...windows.map(([key, window]) => h("div", { key }, amount(window, data))), !windows.length && h("div", null, "—"));
      // Size controls readable density; intrinsic height always accommodates all content.
      const expansion = (clampHeight(height) - 180) / 60;
      const compact = expansion === 0;
      function meter(key, window) {
        const value = amount(window, data);
        const valid = value !== "—";
        const severity = !valid ? null : window.remainingPercent <= 10 ? "critical" : window.remainingPercent <= 25 ? "low" : null;
        const fill = severity === "critical" ? "light-dark(#b5324d, #ff8096)" : severity === "low" ? "light-dark(#92600d, #efb84f)" : "light-dark(#267843, #6fce91)";
        const remainingSeconds = window?.resetsAt ? window.resetsAt - Date.now() / 1000 : 0;
        const unit = remainingSeconds >= 86400 ? "day" : remainingSeconds >= 3600 ? "hour" : "minute";
        const divisor = unit === "day" ? 86400 : unit === "hour" ? 3600 : 60;
        const reset = remainingSeconds > 0 ? new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(Math.ceil(remainingSeconds / divisor), unit) : null;
        return h("div", { key, style: { flex: "1 1 92px", minWidth: 0 } },
          h("div", { style: { fontSize: 28 + expansion * 8, fontWeight: 650, lineHeight: 1.3, fontVariantNumeric: "tabular-nums", marginTop: 4 } }, value),
          h("div", { style: { fontSize: 12 + expansion * 2, lineHeight: 1.5, marginBottom: compact ? 0 : 9 + expansion * 3 } }, t(key === "fiveHour" ? "remainingFiveHour" : "remainingWeekly")),
          !compact && h("div", { ...(valid ? { role: "progressbar", "aria-label": `${allowance.label} ${t(key)} ${t("remaining")}`, "aria-valuenow": window.remainingPercent, "aria-valuemin": 0, "aria-valuemax": 100 } : {}),
            style: { height: 9 + expansion * 3, borderRadius: 3, overflow: "hidden", background: "light-dark(#d3d8df, #4b515c)" } },
            valid && h("div", { style: { height: "100%", width: `${window.remainingPercent}%`, background: fill } })),
          !compact && severity && h("div", { style: { marginTop: 7, fontSize: 12, fontWeight: 650, color: fill } }, t(severity)),
          !compact && reset && h("div", { title: date(window.resetsAt), style: { marginTop: 7, fontSize: 12, lineHeight: 1.4 } }, `${t("resets")} ${reset}`));
      }
      return h("section", { "aria-label": title, style: { color, position: "relative", lineHeight: 1.5, flexShrink: 0, background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: `${18 + expansion * 4}px 12px ${12 + expansion * 4}px`, margin: "4px 0 10px", width: "100%", minWidth: 0, boxSizing: "border-box" } },
        h("div", { role: "separator", tabIndex: 0, "aria-orientation": "horizontal", "aria-label": t("resize"), "aria-valuemin": 180, "aria-valuemax": 240, "aria-valuenow": clampHeight(height), title: t("resize"),
          style: { position: "absolute", top: -5, left: 0, right: 0, height: 16, cursor: "ns-resize", touchAction: "none", display: "flex", justifyContent: "center", alignItems: "center", borderRadius: 5 },
          onPointerDown(event) { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { y: event.clientY, height: heightRef.current }; },
          onPointerMove(event) { if (drag.current) changeHeight(drag.current.height + drag.current.y - event.clientY); },
          onPointerUp(event) { if (!drag.current) return; drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); saveHeight(); },
          onPointerCancel() { drag.current = null; saveHeight(); },
          onLostPointerCapture() { drag.current = null; },
          onKeyDown(event) { const value = event.key === "ArrowUp" ? heightRef.current + 10 : event.key === "ArrowDown" ? heightRef.current - 10 : event.key === "Home" ? 180 : event.key === "End" ? 240 : null; if (value !== null) { event.preventDefault(); changeHeight(value); } },
          onKeyUp(event) { if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) saveHeight(); },
        }, h("span", { "aria-hidden": true, style: { width: 34, height: 3, borderRadius: 2, background: "var(--dsw-alias-label-tertiary)" } })),
        h("div", { style: { minWidth: 0 } },
        h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10 + expansion * 4 } },
          h("div", { style: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: 650, overflowWrap: "anywhere" } }, allowance.label)),
        data?.state !== "ready" ? h("div", { role: "status", style: { fontSize: 14 } }, t(data?.state ?? "loading")) :
          windows.length ? h("div", { style: { display: "flex", flexWrap: "wrap", gap: 16 } }, ...windows.map(([key, window]) => meter(key, window))) :
            h("div", { role: "status", style: { fontSize: 14 } }, t("unavailable")),
        saveError && h("div", { role: "status", style: { fontSize: 12 } }, t("sizeNotSaved"))));
    }
    function Panel({ api, t }) {
      const { data } = useUsage(api);
      return h("section", { style: { color, padding: 16, fontSize: 13 } },
        h("h2", null, t("title")), h("p", { style: { color: muted } }, t("hint")),
        data?.state !== "ready" ? h("p", { role: "status" }, t(data?.state ?? "loading")) :
          data.limits.map(limit => h("div", { key: limit.id, style: { margin: "16px 0", padding: 12, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8 } },
            h("strong", null, limit.name),
            !limit.fiveHour && !limit.weekly && h("p", null, t("unavailable")),
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
      ctx.inject(["remote.claudeUsage", "remote.settings", "modelDirectories", "sessions"], scope => {
        const inject = () => ({ api: scope.remote.claudeUsage });
        const sidebarInject = () => ({ ...inject(), models: scope.modelDirectories, sessions: scope.sessions, settings: scope.remote.settings });
        scope.slots.inject("sidebar.footer.action", () => scope.slots.register({ name: "sidebar.footer.action", id: "claude-usage", order: 31, locale: NS, inject: sidebarInject }, Summary));
        scope.slots.inject("settings.section", () => scope.slots.register({ name: "settings.section", id: "claude-usage", order: 16, label: () => t("title"), locale: NS, inject }, Panel));
      });
      return unmount;
    }
    return { apply, inject: ["slots", "locale", "remote"] };
  },
});
