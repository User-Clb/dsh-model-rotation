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
          map.set(`${group.id}\u0000${model.id}`, { provider: group.id, modelName: model.name });
        }
      }
      return map;
    }

    function providerGroups(catalog) {
      return (catalog ?? []).filter((g) => (g.models ?? []).length > 0);
    }

    function Row({ row, index, isCurrent, dragging, over, onGripDown, onRemove }) {
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
        h("span", { style: styles.model, title: row.model }, row.model),
        row.reasoningEffort ? h("span", { style: styles.hint }, row.reasoningEffort) : null,
        isCurrent ? h("span", { style: styles.badge, title: "当前模型" }) : null,
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
        callRpc(props.ctx, "get")
          .then((value) => setConfig(value))
          .catch((reason) => setError(String(reason?.message ?? reason)));
        callRpc(props.ctx, "catalog", {}, 60000)
          .then((value) => setCatalog(value.catalog ?? []))
          .catch(() => {});
      }

      React.useEffect(() => {
        let alive = true;
        callRpc(props.ctx, "get")
          .then((value) => {
            if (alive) setConfig(value);
          })
          .catch((reason) => {
            if (alive) setError(String(reason?.message ?? reason));
          });
        callRpc(props.ctx, "catalog", {}, 60000)
          .then((value) => {
            if (alive) setCatalog(value.catalog ?? []);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, []);

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
          const next = await callRpc(props.ctx, "set", patch);
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
          const next = await callRpc(props.ctx, "reset");
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

      const enabled = config?.enabled === true;
      const groups = React.useMemo(() => providerGroups(catalog), [catalog]);
      const order = config?.order ?? [];
      const currentKey = currentSelection ? `${currentSelection.provider}\u0000${currentSelection.model}` : null;
      const cycleCount = config?.cycleCount ?? 0;

      return h(
        "div",
        { style: styles.root },
        h(
          "button",
          {
            type: "button",
            title: "模型轮换兜底设置",
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
                    onChange: (event) => save({ enabled: event.target.checked }),
                  }),
                  h("span", { style: styles.label }, "开启轮换兜底（重试耗尽后自动切换模型）"),
                ),
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
                h("span", { style: styles.hint }, `窗口内已完成 ${cycleCount} 轮`),
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
                        onGripDown: beginDrag,
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
                  { type: "button", disabled: busy, onClick: resetLog, style: { ...styles.button, ...styles.danger }, title: "清理循环记录到 0，恢复轮换预算" },
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

    function apply(ctx) {
      ctx.effect(() => {
        try {
          return ctx.slots.inject("conversation.input.activity", () =>
            ctx.slots.register(
              {
                name: "conversation.input.activity",
                id: "model-rotation",
                order: 41,
                label: () => "模型轮换",
              },
              (props) => h(Boundary, null, h(Control, { ...props, ctx })),
            ),
          );
        } catch (error) {
          try {
            console.warn("[model-rotation] composer slot unavailable:", error);
          } catch {
            /* ignore */
          }
          return () => {};
        }
      }, "model-rotation: composer activity");
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    exports.name = NAME;
    return module.exports;
  },
});
