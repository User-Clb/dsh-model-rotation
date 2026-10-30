window.__ModuleLoader__.load({
  id: "dsh-model-rotation",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;

    const NAME = "dsh-model-rotation";

    function connectionRpc(ctx) {
      const connection = ctx?.get?.("connection", false) ?? ctx?.connection;
      const rpc = connection?.rpc;
      if (!rpc || typeof rpc.call !== "function") {
        throw new Error("connection.rpc unavailable");
      }
      return rpc;
    }

    function timeoutSignal(ms = 30000) {
      return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(ms)
        : undefined;
    }

    async function callRpc(ctx, endpoint, payload = {}, timeoutMs = 30000) {
      const rpc = connectionRpc(ctx);
      const response = await rpc.call("/api", "plugin-rpc/model-rotation", { endpoint, payload }, timeoutSignal(timeoutMs));
      if (!response || response.ok !== true) {
        const error = response?.error;
        throw new Error(`Host ${endpoint} failed: ${String(error?.code ?? "unknown")} ${String(error?.message ?? "")}`.trim());
      }
      return response.value;
    }

    const styles = {
      root: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
        minWidth: 0,
        fontSize: "12px",
        color: "var(--dsw-alias-label-primary, #111)",
      },
      trigger: {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        height: "28px",
        padding: "0 10px",
        borderRadius: "999px",
        border: "1px solid var(--dsw-alias-border-l2, #d9d9d9)",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        fontSize: "12px",
        whiteSpace: "nowrap",
      },
      dot: {
        width: "7px",
        height: "7px",
        borderRadius: "50%",
        background: "var(--dsw-alias-label-tertiary, #999)",
        flex: "none",
      },
      dotOn: {
        background: "#22c55e",
        boxShadow: "0 0 0 2px rgba(34,197,94,.18)",
      },
      panel: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px",
        border: "1px solid var(--dsw-alias-border-l2, #d9d9d9)",
        borderRadius: "10px",
        background: "var(--dsw-alias-bg-layer-2, #fff)",
        boxShadow: "0 6px 20px rgba(0,0,0,.08)",
        minWidth: "420px",
        maxWidth: "560px",
      },
      row: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
      },
      label: {
        color: "var(--dsw-alias-label-secondary, #666)",
        flex: "none",
      },
      input: {
        width: "64px",
        height: "24px",
        padding: "0 6px",
        borderRadius: "6px",
        border: "1px solid var(--dsw-alias-border-l2, #d9d9d9)",
        background: "var(--dsw-alias-bg-layer-1, #fff)",
        color: "inherit",
        fontSize: "12px",
      },
      button: {
        height: "24px",
        padding: "0 10px",
        borderRadius: "6px",
        border: "1px solid var(--dsw-alias-border-l2, #d9d9d9)",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        fontSize: "12px",
      },
      buttonPrimary: {
        borderColor: "var(--dsw-alias-state-business-primary, #4b7bec)",
        color: "var(--dsw-alias-state-business-primary, #4b7bec)",
      },
      danger: {
        borderColor: "var(--dsw-alias-state-error-primary, #d33)",
        color: "var(--dsw-alias-state-error-primary, #d33)",
      },
      list: {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        maxHeight: "260px",
        overflowY: "auto",
        border: "1px solid var(--dsw-alias-border-l2, #d9d9d9)",
        borderRadius: "8px",
        padding: "6px",
      },
      item: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 6px",
        borderRadius: "6px",
        background: "transparent",
        border: "1px solid transparent",
        userSelect: "none",
        touchAction: "none",
      },
      itemDragging: {
        opacity: "0.45",
        border: "1px dashed var(--dsw-alias-border-l2, #bbb)",
      },
      itemOver: {
        borderTop: "2px solid var(--dsw-alias-state-business-primary, #4b7bec)",
      },
      itemCurrent: {
        background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04))",
        borderColor: "var(--dsw-alias-state-business-primary, #4b7bec)",
      },
      grip: {
        color: "var(--dsw-alias-label-tertiary, #999)",
        cursor: "grab",
        fontSize: "14px",
        flex: "none",
        lineHeight: "1",
        padding: "2px 4px",
        touchAction: "none",
      },
      provider: {
        color: "var(--dsw-alias-label-tertiary, #999)",
        flex: "none",
        maxWidth: "140px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      model: {
        color: "inherit",
        flex: "1",
        minWidth: "0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      badge: {
        flex: "none",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: "#22c55e",
        boxShadow: "0 0 0 2px rgba(34,197,94,.18)",
      },
      badgeRemove: {
        flex: "none",
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        color: "var(--dsw-alias-label-tertiary, #999)",
        cursor: "pointer",
        fontSize: "13px",
        lineHeight: "1",
      },
      useButton: {
        flex: "none",
        height: "18px",
        padding: "0 7px",
        borderRadius: "999px",
        border: "1px solid var(--dsw-alias-border-l2, #d9d9d9)",
        background: "transparent",
        color: "var(--dsw-alias-label-secondary, #666)",
        cursor: "pointer",
        fontSize: "10px",
        lineHeight: "16px",
        whiteSpace: "nowrap",
      },
      add: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap",
      },
      select: {
        height: "24px",
        padding: "0 6px",
        borderRadius: "6px",
        border: "1px solid var(--dsw-alias-border-l2, #d9d9d9)",
        background: "var(--dsw-alias-bg-layer-1, #fff)",
        color: "inherit",
        fontSize: "12px",
        maxWidth: "220px",
      },
      error: {
        color: "var(--dsw-alias-state-error-primary, #d33)",
        maxWidth: "460px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      hint: {
        color: "var(--dsw-alias-label-tertiary, #999)",
      },
      footer: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
      },
    };

    let Boundary;
    if (React.Component) {
      Boundary = class Boundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { failed: false };
        }

        static getDerivedStateFromError() {
          return { failed: true };
        }

        componentDidCatch(error) {
          try {
            console.warn("[model-rotation] composer control failed:", error);
          } catch {
            /* ignore */
          }
        }

        render() {
          return this.state.failed ? null : this.props.children;
        }
      };
    } else {
      Boundary = (props) => props.children;
    }

    function catalogMap(catalog) {
      const map = new Map();
      for (const group of catalog ?? []) {
        for (const model of group.models ?? []) {
          map.set(`${group.id}\u0000${model.id}`, {
            providerName: group.name,
            modelName: model.name,
            badges: Array.isArray(model.badges) ? model.badges : [],
          });
        }
      }
      return map;
    }

    /** Badge text → chip color (mirrors the model picker's palette). */
    function badgeColor(badge) {
      if (/免费/.test(badge)) return { border: "#22c55e", color: "#22c55e" };
      if (/折扣|半价|优惠/.test(badge)) return { border: "#f59e0b", color: "#f59e0b" };
      if (/订阅|优先|专属/.test(badge)) return { border: "#4b7bec", color: "#4b7bec" };
      return { border: "var(--dsw-alias-border-l2, #999)", color: "var(--dsw-alias-label-secondary, #666)" };
    }

    function providerGroups(catalog) {
      return (catalog ?? []).filter((g) => (g.models ?? []).length > 0);
    }

    function Row({ row, index, isCurrent, dragging, over, disabled, display, onGripDown, onUse, onRemove }) {
      const info = display.get(`${row.provider}\u0000${row.model}`);
      // Full display name (with multiplier / 免费 wording) instead of the raw id.
      const shown = info?.modelName && info.modelName !== row.model ? info.modelName : row.model;
      const badges = info?.badges ?? [];
      return h(
        "div",
        {
          style: {
            ...styles.item,
            ...(isCurrent ? styles.itemCurrent : null),
            ...(dragging ? styles.itemDragging : null),
            ...(over ? styles.itemOver : null),
          },
          "data-rot-index": index,
          draggable: false,
        },
        h(
          "span",
          {
            style: styles.grip,
            title: "按住拖动排序",
            onPointerDown: (e) => onGripDown(index, e),
          },
          "⠿",
        ),
        h("span", { style: styles.provider, title: row.provider }, row.provider),
        h("span", { style: styles.model, title: `${row.model}${info?.modelName ? ` · ${info.modelName}` : ""}` }, shown),
        badges.map((badge) =>
          h(
            "span",
            {
              key: badge,
              style: {
                flex: "none",
                fontSize: "10px",
                lineHeight: "14px",
                padding: "0 5px",
                borderRadius: "4px",
                border: `1px solid ${badgeColor(badge).border}`,
                color: badgeColor(badge).color,
                whiteSpace: "nowrap",
              },
            },
            badge,
          ),
        ),
        row.reasoningEffort ? h("span", { style: styles.hint }, row.reasoningEffort) : null,
        isCurrent ? h("span", { style: styles.badge, title: "当前模型" }) : null,
        isCurrent
          ? null
          : h(
              "button",
              {
                type: "button",
                style: styles.useButton,
                title: "设为当前模型（同步到模型下拉，轮换从此行的下一个继续）",
                disabled: disabled,
                onClick: () => onUse(index),
              },
              "使用",
            ),
        h(
          "button",
          {
            type: "button",
            style: styles.badgeRemove,
            title: "移除",
            onClick: () => onRemove(index),
          },
          "×",
        ),
      );
    }

    const HIDE_STYLE_ID = "dsh-model-rotation-hide-style";

    /**
     * One global rule: hide the composer's single-select model seat while the
     * rotation control in THIS composer card is enabled. Scoping to the card
     * keeps other sessions' composers (with rotation off) untouched.
     */
    function ensureHideStyle() {
      if (typeof document === "undefined") return;
      const css = '[data-composer-card][data-dsh-rotation-on] [data-slot="conversation.input.model"]{display:none !important}';
      const existing = document.getElementById(HIDE_STYLE_ID);
      if (existing !== null && existing.textContent === css) return;
      const style = existing ?? document.createElement("style");
      style.id = HIDE_STYLE_ID;
      style.textContent = css;
      if (existing === null) (document.head ?? document.documentElement).appendChild(style);
    }

    /**
     * Mark (or unmark) the composer card that hosts this control. The host
     * InputBar re-renders freely, but plain attributes on its DOM node survive
     * reconciliation as long as React doesn't own the attribute — it doesn't.
     * A MutationObserver re-applies the mark if the card node is ever replaced.
     */
    function useCardRotationMark(rootRef, on) {
      React.useEffect(() => {
        if (typeof document === "undefined") return;
        ensureHideStyle();
        let observer = undefined;
        let markedCard = undefined;

        const findCard = () => {
          const node = rootRef.current;
          if (node === null || node === undefined || node.ownerDocument !== document) return null;
          return node.closest("[data-composer-card]");
        };

        const apply = () => {
          // Fast path: still correctly marked — skip the DOM walk. The card
          // node may be recreated during streaming (many childList mutations),
          // and this observer must stay O(1) per mutation.
          if (
            markedCard !== undefined
            && markedCard.isConnected
            && markedCard.hasAttribute("data-dsh-rotation-on") === on
          ) return;
          const card = findCard();
          if (card === null) return;
          if (markedCard !== undefined && markedCard !== card) {
            markedCard.removeAttribute("data-dsh-rotation-on");
          }
          markedCard = card;
          if (on) card.setAttribute("data-dsh-rotation-on", "1");
          else card.removeAttribute("data-dsh-rotation-on");
        };

        apply();
        // The card node may be recreated (session switch, layout change) while
        // this control persists; watch for that and re-mark.
        observer = new MutationObserver(apply);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
          observer?.disconnect();
          markedCard?.removeAttribute("data-dsh-rotation-on");
        };
      }, [on]);
    }

    function Control(props) {
      const [open, setOpen] = React.useState(false);
      const [config, setConfig] = React.useState(null);
      const [catalog, setCatalog] = React.useState([]);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState("");
      const [saved, setSaved] = React.useState("");
      const [addProvider, setAddProvider] = React.useState("");
      const [addModel, setAddModel] = React.useState("");
      const [currentSelection, setCurrentSelection] = React.useState(null);
      const [draggingIndex, setDraggingIndex] = React.useState(null);
      const [overIndex, setOverIndexState] = React.useState(-1);

      const listRef = React.useRef(null);
      const dragInfo = React.useRef(null);
      const overIndexRef = React.useRef(-1);
      const saveTimer = React.useRef(null);
      const savedTimer = React.useRef(null);
      const requestSeq = React.useRef(0);
      const rootRef = React.useRef(null);

      const activeRef = React.useRef(false);

      function setOverIndex(index) {
        overIndexRef.current = index;
        setOverIndexState(index);
      }

      function setActive(next) {
        if (next) refresh();
        setOpen(next);
        if (activeRef.current !== next) {
          activeRef.current = next;
          props.onActiveChange?.(next);
        }
      }

      React.useEffect(() => () => {
        if (activeRef.current) {
          activeRef.current = false;
          props.onActiveChange?.(false);
        }
        window.removeEventListener("pointermove", onDragMove, true);
        window.removeEventListener("pointerup", onDragEnd, true);
        window.removeEventListener("pointercancel", onDragEnd, true);
      }, []);

      React.useEffect(() => () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (savedTimer.current) clearTimeout(savedTimer.current);
      }, []);

      function refresh() {
        callRpc(props.ctx, "get", { sessionId: props.sessionId ?? undefined })
          .then((value) => setConfig(value))
          .catch((reason) => setError(String(reason?.message ?? reason)));
        callRpc(props.ctx, "catalog", { sessionId: props.sessionId ?? undefined }, 60000)
          .then((value) => setCatalog(value.catalog ?? []))
          .catch(() => {});
      }

      React.useEffect(() => {
        let alive = true;
        callRpc(props.ctx, "get", { sessionId: props.sessionId ?? undefined })
          .then((value) => {
            if (alive) setConfig(value);
          })
          .catch((reason) => {
            if (alive) setError(String(reason?.message ?? reason));
          });
        callRpc(props.ctx, "catalog", { sessionId: props.sessionId ?? undefined }, 60000)
          .then((value) => {
            if (alive) setCatalog(value.catalog ?? []);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [props.sessionId]);

      // Track the composer's current model via the Host-side resolution
      // (projection → request header → default). The trigger always shows the
      // green dot when the current model is in the list, so poll whenever the
      // trigger is visible — not only when the panel is open.
      React.useEffect(() => {
        let alive = true;
        const read = () =>
          callRpc(props.ctx, "current", { sessionId: props.sessionId ?? undefined }, 15000)
            .then((value) => {
              if (alive) setCurrentSelection(value?.current ?? null);
            })
            .catch(() => {});
        read();
        const timer = setInterval(read, 3000);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, [props.sessionId]);

      function markSaved() {
        setSaved("已自动保存");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(""), 1800);
      }

      async function save(patch) {
        const sequence = ++requestSeq.current;
        setBusy(true);
        setError("");
        try {
          const next = await callRpc(props.ctx, "set", { ...patch, sessionId: props.sessionId ?? undefined });
          if (sequence === requestSeq.current) {
            setConfig(next);
            markSaved();
          }
        } catch (reason) {
          if (sequence === requestSeq.current) {
            setError(String(reason?.message ?? reason));
          }
        } finally {
          if (sequence === requestSeq.current) setBusy(false);
        }
      }

      function scheduleSave(patch) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          save(patch);
        }, 350);
      }

      function flushSave(patch) {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        save(patch);
      }

      async function resetLog() {
        setBusy(true);
        setError("");
        try {
          const next = await callRpc(props.ctx, "reset", { sessionId: props.sessionId ?? undefined });
          setConfig(next);
          markSaved();
        } catch (reason) {
          setError(String(reason?.message ?? reason));
        } finally {
          setBusy(false);
        }
      }

      /* ---- pointer-based drag reordering (no HTML5 DnD: the composer's
         global file-drag handlers swallow native dragover/drop events) ---- */

      function beginDrag(index, e) {
        if (busy || (config?.order ?? []).length < 2) return;
        e.preventDefault();
        e.stopPropagation();
        dragInfo.current = { index, moved: false };
        setDraggingIndex(index);
        window.addEventListener("pointermove", onDragMove, true);
        window.addEventListener("pointerup", onDragEnd, true);
        window.addEventListener("pointercancel", onDragEnd, true);
      }

      function onDragMove(e) {
        const info = dragInfo.current;
        if (!info) return;
        const list = listRef.current;
        if (!list) return;
        const items = Array.from(list.querySelectorAll("[data-rot-index]"));
        let target = -1;
        for (let i = 0; i < items.length; i++) {
          const rect = items[i].getBoundingClientRect();
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            target = i;
            break;
          }
        }
        if (target < 0) return;
        info.moved = true;
        setOverIndex(target);
      }

      function onDragEnd() {
        window.removeEventListener("pointermove", onDragMove, true);
        window.removeEventListener("pointerup", onDragEnd, true);
        window.removeEventListener("pointercancel", onDragEnd, true);
        const info = dragInfo.current;
        const target = overIndexRef.current;
        dragInfo.current = null;
        setDraggingIndex(null);
        setOverIndex(-1);
        if (!info || !info.moved || target < 0 || target === info.index) return;
        const order = [...(config?.order ?? [])];
        if (info.index >= order.length) return;
        const [moved] = order.splice(info.index, 1);
        order.splice(Math.min(target, order.length), 0, moved);
        save({ order });
      }

      function addCurrent() {
        if (!addProvider || !addModel) return;
        const row = { provider: addProvider, model: addModel };
        save({ order: [...(config?.order ?? []), row] });
        setAddProvider("");
        setAddModel("");
      }

      function removeRow(index) {
        const next = (config?.order ?? []).filter((_, i) => i !== index);
        save({ order: next });
      }

      async function useRow(index) {
        setBusy(true);
        setError("");
        try {
          const value = await callRpc(props.ctx, "use", { index, sessionId: props.sessionId ?? undefined });
          setConfig(value);
          if (value?.current) setCurrentSelection(value.current);
          markSaved();
          announceRouteChange();
        } catch (reason) {
          setError(String(reason?.message ?? reason));
        } finally {
          setBusy(false);
        }
      }

      /**
       * Broadcast that this session's effective route changed. The badge reads
       * the modelSelection projection, which advances on the committed event —
       * but a `use`/rotation switch also needs the DISPLAY details refetched
       * (the projection carries only provider/model/effort). This window event
       * lets the badge refresh immediately instead of waiting for the next
       * projection revision to be observed.
       */
      function announceRouteChange() {
        try {
          window.dispatchEvent(new CustomEvent("dsh-model-rotation:route-changed", {
            detail: { sessionId: props.sessionId ?? null },
          }));
        } catch {
          /* ignore */
        }
      }

      const enabled = config?.enabled === true;
      const groups = React.useMemo(() => providerGroups(catalog), [catalog]);
      const display = React.useMemo(() => catalogMap(catalog), [catalog]);
      const order = config?.order ?? [];
      const currentKey = currentSelection ? `${currentSelection.provider}\u0000${currentSelection.model}` : null;
      const cycleCount = config?.cycleCount ?? 0;

      // Rotation ON in this conversation → hide the composer's single-select
      // model seat; OFF → show it again. With an empty list there is nothing
      // to rotate through, so keep the seat visible as the model entry point.
      useCardRotationMark(rootRef, enabled && order.length > 0);

      return h(
        "div",
        { style: styles.root, ref: rootRef },
        h(
          "button",
          {
            type: "button",
            title: "模型轮换兜底设置（开关仅作用于当前对话）",
            disabled: props.locked === true,
            onClick: () => setActive(!open),
            style: styles.trigger,
          },
          h("span", { style: enabled ? { ...styles.dot, ...styles.dotOn } : styles.dot }),
          "模型轮换",
          h("span", { style: { opacity: 0.85 } }, config === null ? "…" : enabled ? "开" : "关"),
        ),
        open
          ? h(
              "div",
              { style: styles.panel },
              h(
                "div",
                { style: styles.row },
                h(
                  "label",
                  { style: styles.row },
                  h("input", {
                    type: "checkbox",
                    checked: enabled,
                    disabled: busy || !config,
                    onChange: (event) => save({ sessionEnabled: event.target.checked }),
                  }),
                  h("span", { style: styles.label }, "本对话开启轮换兜底（重试耗尽后自动切换模型；仅当前对话，不影响其他会话）"),
                ),
              ),
              h(
                "div",
                { style: styles.row },
                h("span", { style: styles.hint }, "轮换列表为全部对话共享；循环进度按对话独立计算。"),
              ),
              h(
                "div",
                { style: styles.row },
                h("span", { style: styles.label }, "完整循环上限"),
                h("input", {
                  type: "number",
                  min: 1,
                  max: 20,
                  value: config?.maxCycles ?? 3,
                  disabled: !config,
                  style: styles.input,
                  onChange: (event) => {
                    const value = Number(event.target.value);
                    setConfig((c) => (c ? { ...c, maxCycles: value } : c));
                    scheduleSave({ maxCycles: value });
                  },
                  onBlur: (event) => flushSave({ maxCycles: Number(event.target.value) }),
                  onKeyDown: (event) => { if (event.key === "Enter") event.currentTarget.blur(); },
                }),
                h("span", { style: styles.label }, "循环窗口(分钟)"),
                h("input", {
                  type: "number",
                  min: 1,
                  max: 1440,
                  value: Math.round((config?.cycleWindowMs ?? 1800000) / 60000),
                  disabled: !config,
                  style: styles.input,
                  onChange: (event) => {
                    const value = Number(event.target.value);
                    setConfig((c) => (c ? { ...c, cycleWindowMs: Math.max(1, value) * 60000 } : c));
                    scheduleSave({ cycleWindowMs: Math.max(1, value) * 60000 });
                  },
                  onBlur: (event) => flushSave({ cycleWindowMs: Math.max(1, Number(event.target.value)) * 60000 }),
                  onKeyDown: (event) => { if (event.key === "Enter") event.currentTarget.blur(); },
                }),
                h("span", { style: styles.hint }, `本对话窗口内已完成 ${cycleCount} 轮`),
              ),
              h(
                "div",
                { style: styles.list, ref: listRef },
                order.length === 0
                  ? h("div", { style: styles.hint }, "轮换列表为空：从下方「选择平台 → 选择模型 → 添加」加入。")
                  : order.map((row, index) =>
                      h(Row, {
                        key: `${row.provider}\u0000${row.model}`,
                        row,
                        index,
                        isCurrent: currentKey !== null && `${row.provider}\u0000${row.model}` === currentKey,
                        dragging: draggingIndex === index,
                        over: overIndex === index,
                        disabled: busy,
                        display,
                        onGripDown: beginDrag,
                        onUse: useRow,
                        onRemove: removeRow,
                      }),
                    ),
              ),
              h(
                "div",
                { style: styles.add },
                h(
                  "select",
                  {
                    value: addProvider,
                    disabled: busy || groups.length === 0,
                    onChange: (event) => { setAddProvider(event.target.value); setAddModel(""); },
                    style: styles.select,
                  },
                  h("option", { value: "" }, "选择平台…"),
                  groups.map((group) =>
                    h("option", { key: group.id, value: group.id }, group.name || group.id),
                  ),
                ),
                h(
                  "select",
                  {
                    value: addModel,
                    disabled: busy || !addProvider,
                    onChange: (event) => setAddModel(event.target.value),
                    style: styles.select,
                  },
                  h("option", { value: "" }, "选择模型…"),
                  (groups.find((g) => g.id === addProvider)?.models ?? []).map((m) =>
                    h("option", { key: m.id, value: m.id }, m.name || m.id),
                  ),
                ),
                h(
                  "button",
                  { type: "button", disabled: busy || !addProvider || !addModel, onClick: addCurrent, style: { ...styles.button, ...styles.buttonPrimary } },
                  "添加",
                ),
              ),
              h(
                "div",
                { style: styles.footer },
                h(
                  "button",
                  { type: "button", disabled: busy, onClick: resetLog, style: { ...styles.button, ...styles.danger }, title: "清理本对话的循环记录到 0，恢复轮换预算（仅当前对话）" },
                  "重置循环记录",
                ),
                h(
                  "button",
                  { type: "button", onClick: () => setActive(false), style: styles.button },
                  "收起",
                ),
                busy ? h("span", { style: styles.hint }, "保存中…") : null,
                saved ? h("span", { style: styles.hint }, saved) : null,
                error ? h("span", { style: styles.error, title: error }, error) : null,
              ),
            )
          : null,
      );
    }

    const badgeStyles = {
      wrap: {
        // Sits ABOVE the card: `top: -20px` = the pill's own height, so its
        // BOTTOM EDGE rests on the card's top border. The card's margin-top
        // (set by the badge rule) reserves this strip, so nothing is covered
        // and the editor inside the card is untouched.
        position: "absolute",
        top: "-20px",
        left: "12px",
        zIndex: 3,
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        maxWidth: "calc(100% - 20px)",
        padding: "1px 7px",
        borderRadius: "999px",
        border: "1px solid var(--dsw-alias-border-l2, #d9d9d9)",
        background: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,.6))",
        backdropFilter: "blur(4px)",
        color: "var(--dsw-alias-label-secondary, #666)",
        fontSize: "11px",
        lineHeight: "16px",
        whiteSpace: "nowrap",
        pointerEvents: "auto",
        userSelect: "none",
      },
      provider: {
        color: "var(--dsw-alias-label-tertiary, #999)",
        flex: "none",
        maxWidth: "90px",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
      sep: { color: "var(--dsw-alias-label-tertiary, #999)", flex: "none" },
      model: {
        color: "var(--dsw-alias-label-primary, #111)",
        fontWeight: 500,
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
      },
      effort: { color: "var(--dsw-alias-label-tertiary, #999)", flex: "none" },
      chip: {
        flex: "none",
        fontSize: "10px",
        lineHeight: "13px",
        padding: "0 4px",
        borderRadius: "3px",
        border: "1px solid",
        whiteSpace: "nowrap",
      },
      empty: { color: "var(--dsw-alias-label-tertiary, #999)" },
    };

    /**
     * The composer badge: provider : full model name (multiplier + badges).
     *
     * Realtime by construction — it reads the `modelSelection` projection
     * straight from the session (the same durable state every other surface
     * renders from), so a rotation switch, a rotation-row "use", or a
     * hand-picked model in the seat all move the badge on the next projection
     * revision, with no polling.
     *
     * The display name/multiplier/badges are not in the projection, so they
     * are resolved locally from the `catalog` snapshot (already served by the
     * host) and re-fetched with it.
     */
    function CurrentModelBadge(props) {
      const rootRef = React.useRef(null);
      useCardBadgeMark(rootRef);

      // Display details (provider display name, catalog model name carrying the
      // multiplier / 免费 wording, billing badges). Resolved from the `catalog`
      // endpoint so the badge shows full names without needing any new host
      // endpoint to be live.
      const [catalog, setCatalog] = React.useState([]);
      React.useEffect(() => {
        let alive = true;
        callRpc(props.ctx, "catalog", { sessionId: props.sessionId ?? undefined }, 60000)
          .then((value) => {
            if (alive) setCatalog(value?.catalog ?? []);
          })
          .catch(() => {});
        return () => { alive = false; };
      }, [props.ctx, props.sessionId]);

      // Projection read: `useProjection` is part of the session standard kit
      // (a keyed hook over the session's modelSelection view). Reading it here
      // makes the badge follow every durable switch with zero polling.
      let projected = null;
      try {
        if (typeof props.useProjection === "function") {
          projected = props.useProjection("modelSelection", (state) => {
            if (state === null || state === undefined) return null;
            // Wire view exposes `next`; raw state exposes pending/lastUsed.
            const settled = state.next !== undefined ? state.next : (state.pending ?? state.lastUsed);
            if (settled === null || settled === undefined) return null;
            return {
              provider: settled.provider,
              model: settled.model,
              reasoningEffort: settled.reasoningEffort ?? null,
            };
          });
        }
      } catch {
        projected = null;
      }

      const provider = projected?.provider ?? null;
      const model = projected?.model ?? null;
      const effort = projected?.reasoningEffort ?? null;

      // If the projection is empty (fresh session, no event yet), ask the host
      // for the effective route once and cache it until the projection speaks.
      const [fallback, setFallback] = React.useState(null);
      React.useEffect(() => {
        if (projected !== null) return undefined;
        let alive = true;
        callRpc(props.ctx, "current", { sessionId: props.sessionId ?? undefined }, 20000)
          .then((value) => {
            if (alive) setFallback(value?.current ?? null);
          })
          .catch(() => {});
        return () => { alive = false; };
      }, [props.ctx, props.sessionId, projected]);

      const route = projected ?? fallback;
      const providerId = route?.provider ?? null;
      const modelId = route?.model ?? null;
      const shownEffort = route?.reasoningEffort ?? null;

      if (providerId === null && modelId === null) return null;

      // Resolve display name + badges from the catalog snapshot.
      let providerName = providerId;
      let modelName = modelId;
      let badges = [];
      for (const group of catalog) {
        if (group?.id !== providerId) continue;
        providerName = group.name || providerId;
        const found = (group.models ?? []).find((entry) => entry?.id === modelId);
        if (found !== undefined) {
          if (typeof found.name === "string" && found.name.length > 0) modelName = found.name;
          if (Array.isArray(found.badges)) badges = found.badges;
        }
        break;
      }

      return h(
        "span",
        {
          ref: rootRef,
          style: badgeStyles.wrap,
          title: `${providerName ?? "?"} : ${modelName ?? "?"}${shownEffort ? ` (${shownEffort})` : ""}`,
        },
        h("span", { style: badgeStyles.provider }, providerName ?? "?"),
        h("span", { style: badgeStyles.sep }, ":"),
        h("span", { style: badgeStyles.model }, modelName ?? "?"),
        shownEffort ? h("span", { style: badgeStyles.effort }, shownEffort) : null,
        badges.map((badge) =>
          h(
            "span",
            {
              key: badge,
              style: {
                ...badgeStyles.chip,
                borderColor: badgeColor(badge).border,
                color: badgeColor(badge).color,
              },
            },
            badge,
          ),
        ),
      );
    }

    const BADGE_STYLE_ID = "dsh-model-rotation-badge-style";
    const BADGE_ATTR = "data-dsh-model-badge";

    /**
     * Layout rule for the badge.
     *
     * The badge belongs ABOVE the card, with its bottom edge meeting the card's
     * top border — in the gap between the composer card and whatever sits over
     * it (the thinking/status row). Two rules do that:
     *
     *   - the card reserves that strip with `margin-top`, so nothing overlaps
     *     and nothing is pushed off-screen (a flex item's margin is inside the
     *     parent's content box, so an overflow-hidden ancestor cannot clip it).
     *     `margin-top` is badge height (20px) plus a breathing gap above the
     *     badge (14px), so the pill does not butt against the transcript's
     *     action row directly above it;
     *   - the badge itself is absolutely positioned `top: -20px` from the
     *     card's top edge — exactly its own height — so its BOTTOM EDGE lands
     *     on the card's top border.
     *
     * The editor is untouched: no padding is added inside the card, so the
     * placeholder and first line keep their original position.
     *
     * Scoped by the badge attribute so only this card changes.
     */
    function ensureBadgeStyle() {
      if (typeof document === "undefined") return;
      const css = "[data-composer-card][data-dsh-model-badge]{margin-top:34px !important}";
      const existing = document.getElementById(BADGE_STYLE_ID);
      if (existing !== null && existing.textContent === css) return;
      // A hot-reloaded module finds the PREVIOUS injection still in the DOM.
      // Overwrite its text instead of bailing out, or a stale spacing rule
      // would survive every reload.
      const style = existing ?? document.createElement("style");
      style.id = BADGE_STYLE_ID;
      style.textContent = css;
      if (existing === null) (document.head ?? document.documentElement).appendChild(style);
    }

    /** Mark the hosting composer card while the badge is rendered. */
    function useCardBadgeMark(rootRef) {
      React.useEffect(() => {
        if (typeof document === "undefined") return undefined;
        ensureBadgeStyle();
        let observer = undefined;
        let markedCard = undefined;
        const findCard = () => {
          const node = rootRef.current;
          if (node === null || node === undefined || node.ownerDocument !== document) return null;
          return node.closest("[data-composer-card]");
        };
        const apply = () => {
          if (markedCard !== undefined && markedCard.isConnected && markedCard.hasAttribute(BADGE_ATTR)) return;
          const card = findCard();
          if (card === null) return;
          if (markedCard !== undefined && markedCard !== card) markedCard.removeAttribute(BADGE_ATTR);
          markedCard = card;
          card.setAttribute(BADGE_ATTR, "1");
        };
        apply();
        observer = new MutationObserver(apply);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => {
          observer?.disconnect();
          markedCard?.removeAttribute(BADGE_ATTR);
        };
      }, []);
    }

    function apply(ctx) {
      ctx.effect(() => {
        const disposers = [];
        // 1) The rotation control in the composer's activity area.
        try {
          disposers.push(
            ctx.slots.inject("conversation.input.activity", () =>
              ctx.slots.register(
                {
                  name: "conversation.input.activity",
                  id: "model-rotation",
                  order: 41,
                  label: () => "模型轮换",
                },
                (props) => h(Boundary, null, h(Control, { ...props, ctx })),
              ),
            ),
          );
        } catch (error) {
          try {
            console.warn("[model-rotation] composer activity slot unavailable:", error);
          } catch {
            /* ignore */
          }
        }
        // 2) The live current-model badge over the composer's top-left corner.
        try {
          disposers.push(
            ctx.slots.inject("conversation.input.overlay", () =>
              ctx.slots.register(
                {
                  name: "conversation.input.overlay",
                  id: "model-rotation-current-badge",
                  order: 40,
                },
                (props) => h(Boundary, null, h(CurrentModelBadge, { ...props, ctx })),
              ),
            ),
          );
        } catch (error) {
          try {
            console.warn("[model-rotation] composer overlay slot unavailable:", error);
          } catch {
            /* ignore */
          }
        }
        return () => {
          for (const dispose of disposers) {
            try {
              dispose();
            } catch {
              /* ignore */
            }
          }
        };
      }, "model-rotation: composer slots");
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    exports.name = NAME;
    return module.exports;
  },
});
