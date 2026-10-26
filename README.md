# dsh-model-rotation

[中文](#中文说明) | [English](#english)

---

## 中文说明

**DSH（DeepSeek Harness）模型轮换兜底插件**：模型请求在**重试次数超过最大次数后**，或遇到**模型侧故障**（额度用尽、429、soft_rate、限流、超时、上游不可用等）时，按预设的**跨平台模型顺序**循环轮流切换继续运行，直到成功，或短时间内所有模型都不可用为止。

### 功能特性

- **精确的重试边界协作**：与官方 `@deepseek-ai/dsh-llm-retry` 无缝配合——重试预算内不打扰（由官方重试器自行结算），**预算耗尽或故障码不可重试时才接管**，切换模型后在同一 turn 内重跑失败的 step。
- **全码路故障捕获**：按稳定故障码路由（`QUOTA` / `ACCOUNT_QUOTA` / `RATE_LIMIT` / `SERVER` / `TIMEOUT` / `TRANSPORT` / `AUTH` / `MISSING_CREDENTIAL` / `INVALID_CREDENTIAL` / `EMPTY_RESPONSE` / `NO_ADAPTER` …），并叠加措辞兜底识别：
  - `429`、`soft_rate`、`额度已用尽`、`额度不足`、`余额不足`、`配额`
  - `temporarily set aside`、`soonest returns in`、`upstream`、`no available channel`、`无可用渠道`
  - 连接重置 / 拒绝 / 超时、`socket hang up`、`bad gateway`、空响应等
  - `CONTEXT_WINDOW_EXCEEDED`（上下文超限，归 compaction 管）与用户取消**不触发**轮换
- **跨平台模型目录**：从 `ctx.llm.listProviders()` + `listModels()` 读取所有已配置平台的全部模型（DeepSeek 官方 / WorkBuddy / NVIDIA NIM / AMD / OpenRouter / 智谱 / 讯飞 / 硅基流动……），一个列表自由混排。
- **循环兜底机制**：一轮 = 列表里每个模型都试过一次；默认 **30 分钟窗口内完成 3 轮完整循环**即停止继续轮换（= 短期内所有模型都不可用），失败按原样上报。「重置循环记录」一键清零恢复预算。
- **输入框内组件**：面板直接挂在 composer 活动区——总开关、循环上限/窗口设置、模型列表、添加/移除、拖动排序、重置按钮，全部就地完成。
- **与模型选择列表联动**：
  - 轮换切换走官方 `session.selectModel` 同一条持久化路径（`model/selection` 事件 + modelSelection 投影），composer 模型座位、`/model` 弹窗、会话投影**自动跟随显示新模型**；
  - 列表内当前实际生效的模型以**绿色圆点**实时标识，轮换到哪行圆点跟到哪行；
  - 当前模型解析链与 session-controller 一致：投影 pending → lastUsed → 请求头 → 部署默认模型，全新会话也能正确显示。

### 安装

#### 方式一：从本仓库（本地 link）

```powershell
# 1. 克隆到本地
git clone https://github.com/User-Clb/dsh-model-rotation.git "$env:USERPROFILE\.dsh\local-plugins\dsh-model-rotation"

# 2. 建 junction 进 desktop profile 的 node_modules
cmd /c mklink /J "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-model-rotation" "$env:USERPROFILE\.dsh\local-plugins\dsh-model-rotation"
```

#### 方式二：作为 profile 依赖安装

```powershell
dsh plugin --profile desktop add "https://github.com/User-Clb/dsh-model-rotation/archive/refs/heads/main.tar.gz"
```

然后在 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: dsh-model-rotation
      name: dsh-model-rotation
      inject: [llm, agents, sessionProjections]
    - id: dsh-model-rotation-client
      name: dsh-model-rotation
```

重启 DSH。输入框右侧出现「模型轮换」开关即安装成功。

### 配置

配置持久化在 `~/.dsh/model-rotation.json`（面板修改自动保存）：

```json
{
  "enabled": true,
  "order": [
    { "provider": "workbuddy", "model": "deepseek-v4.1-flash" },
    { "provider": "nvapi", "model": "z-ai/glm-5.3-flash" },
    { "provider": "bigmodel", "model": "glm-4.7-flash" }
  ],
  "maxCycles": 3,
  "cycleWindowMs": 1800000,
  "catalog": []
}
```

| 字段 | 含义 |
|---|---|
| `enabled` | 总开关；关闭时使用模型选择列表单选的模型 |
| `order` | 轮换顺序（跨平台 provider/model 对，可含 reasoningEffort） |
| `maxCycles` | 窗口内允许的完整循环轮数上限（默认 3） |
| `cycleWindowMs` | 循环窗口时长（默认 30 分钟） |
| `catalog` | 面板展示用的目录快照（自动维护） |

### 工作原理

```
模型请求失败
   │
   ▼
agent/request-error 瀑布
   │
   ├─ dsh-llm-retry（上游）：预算内 → 自行结算 {kind:'retry'}，本插件收不到事件
   │                          （重试次数内不轮换）
   ▼
预算耗尽 / 不可重试码 / 无策略 → next() 委托下游
   │
   ▼
dsh-model-rotation（下游，本地 patch 层天然在其后）
   ├─ 故障分类（码路由 + 措辞兜底）→ 非模型侧故障 → 继续委托（原样上报）
   ├─ 读取当前生效模型（四层解析链）→ 定位列表下标 → 取下一行
   ├─ 循环预算检查（窗口内完整轮数 < maxCycles？）
   └─ 写入官方同款 model/selection 持久化事件 → 返回 {kind:'retry'}
        │
        ▼
   循环重建请求（agent/request 监听器钉住新路由）→ 用新模型重跑该 step
```

### 许可证

MIT

---

## English

**Model rotation fallback plugin for DSH (DeepSeek Harness)**: when a model request exhausts its retry budget, or fails with a model-side problem (quota exhausted, 429, soft_rate, rate limiting, timeouts, upstream outages), it rotates through a preset **cross-platform model list** in order, re-running the failed step until one model succeeds — or until every model has been tried within the window.

### Highlights

- **Exact retry-boundary cooperation**: sits downstream of the official `@deepseek-ai/dsh-llm-retry` on the `agent/request-error` waterfall. In-budget retries are settled upstream and never reach this plugin; only exhausted budgets / ineligible codes take the rotation path.
- **Full failure coverage**: stable code routing (`QUOTA`, `ACCOUNT_QUOTA`, `RATE_LIMIT`, `SERVER`, `TIMEOUT`, `TRANSPORT`, `AUTH`, …) plus message-wording fallback (`429`, `soft_rate`, quota/balance wording in English and Chinese, connection resets, empty responses…). Context-window overruns and user cancellation do not rotate.
- **Cross-platform catalog**: reads every configured provider through `ctx.llm.listProviders()` / `listModels()`; freely mix DeepSeek, WorkBuddy, NVIDIA NIM, AMD, OpenRouter, Zhipu, iFlytek and more in one ordered list.
- **Cycle budget**: one round = every model tried once. After `maxCycles` (default 3) complete rounds within `cycleWindowMs` (default 30 min), rotation stops and the failure surfaces normally. A reset button clears the record.
- **In-composer panel**: enable switch, cycle settings, drag-sortable list with add/remove, and the reset button — all inside the composer's activity area.
- **Synced with the model picker**: rotation writes the same durable `model/selection` event as the official `session.selectModel` RPC, so the composer model seat, `/model` popup and session projections follow automatically; the currently effective model is marked with a green dot in the list.

### Install / Configure

See the Chinese section above — the layout is identical; config lives in `~/.dsh/model-rotation.json` and the profile patch needs the two insert rows (`dsh-model-rotation` host row + client row).

### License

MIT
