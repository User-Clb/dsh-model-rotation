/**
 * dsh-model-rotation — model rotation fallback after retry budget exhaustion.
 *
 * Host half:
 *   - listens on `agent/request-error` (AFTER dsh-llm-retry, because local
 *     bundle patch layers apply after the base bundle layer): while the retry
 *     policy still has budget, dsh-llm-retry settles the waterfall itself and
 *     this listener never runs — so retries within budget do NOT rotate.
 *     When the budget is exhausted, the policy is ineligible for the failure
 *     code, or there is no policy, dsh-llm-retry calls `next()` and we get the
 *     failure. We then classify it (model-side problems: QUOTA, ACCOUNT_QUOTA,
 *     RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT, EMPTY_RESPONSE, AUTH,
 *     MISSING_CREDENTIAL, INVALID_CREDENTIAL, 429/soft_rate/额度用尽 wording,
 *     and UNKNOWN protocol noise) and — when rotation is enabled — switch the
 *     agent to the next model in the configured order and return
 *     `{ kind: 'retry' }` so the loop re-runs the step on the new model.
 *   - the switch writes the exact same durable `model/selection` event the
 *     official `session.selectModel` RPC writes, so the Web GUI's composer
 *     model seat and the /model popup reflect the rotated model immediately.
 *   - an `agent/request` waterfall listener covers the case where a retry
 *     rebuilds its request from a stale assembled route: it overrides
 *     provider/model with the agent's latest durable modelSelection projection
 *     before dispatch.
 *   - exposes get/set/reset/pickNative over a plugin RPC route for the
 *     composer control; `set` accepts the ordered rotation list, the enable
 *     switch, per-window round limit and the model catalog snapshot used for
 *     display. The native file picker is inherited from local-web-control.
 *
 * Rotation guard: each switch appends to a ring of timestamps. If a full
 * `list.length`-sized cycle completed `cycleWindowMs` ago or earlier (default
 * 30 min), every model has failed within that window and rotation stops for
 * this turn — the failure then surfaces normally. A reset button clears the
 * record.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const name = 'dsh-model-rotation';
export const inject = ['llm', 'agents', 'sessionProjections'];

const RPC_PATH = '/api/plugin-rpc/model-rotation';
const RPC_METHOD = 'plugin-rpc/model-rotation';
const CONFIG_FILE = path.join(
  process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh'),
  'model-rotation.json',
);

/** Failure codes the loop surfaces for model-request problems. */
const MODEL_SIDE_CODES = new Set([
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
  'EMPTY_RESPONSE',
  'QUOTA',
  'ACCOUNT_QUOTA',
  'AUTH',
  'MISSING_CREDENTIAL',
  'INVALID_CREDENTIAL',
  // INVALID_REQUEST removed: a 400 about the REQUEST (bad params, content policy,
  // oversized body) is not a model outage — rotating through the list cannot fix
  // the payload. Genuine model-side 400 envelopes (prompt-too-long, effort) are
  // caught by the wording rules under their real codes instead.
  'PROTOCOL',
  'UNSUPPORTED_REASONING_EFFORT',
  'NO_ADAPTER',
  'UNKNOWN',
]);

/** Message wording that marks a model-side outage even under an odd code. */
const MODEL_SIDE_TEXT = [
  /429\b/,
  /\bsoft_rate\b/,
  /rate[_ -]?limit/i,
  /额度已用尽/,
  /额度不足/,
  /余额不足/,
  /配额/,
  /quota/i,
  /temporarily set aside/,
  /soonest returns in/i,
  // "upstream" ONLY with a failure noun — bare /upstream/i matched informational
  // envelopes that merely mention an upstream and rotated away working models.
  /上游(失败|异常|不可用|拒绝|故障|错误|超时)/,
  /upstream (error|failure|failed|unavailable|rejected|busy|overloaded|timeout)/i,
  /temporarily (unavailable|overloaded)/i,
  /no available channel/i,
  /无可用渠道/,
  /server (is )?(busy|error|overloaded)/i,
  /bad gateway/i,
  /service unavailable/i,
  /internal server error/i,
  /connection (reset|refused|timed? ?out)/i,
  /socket hang up/i,
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN/,
  /failed to (fetch|connect)/i,
  /empty response/i,
  /account (is )?(suspended|disabled|expired)/i,
  // Provider-envelope compatibility failures: the model (or its adapter route)
  // cannot serve THIS request shape — another model in the list usually can.
  /does not support reasoning effort/i,
  /unsupported (reasoning )?effort/i,
  /reasoning effort .* (is )?(not )?support/i,
  /does not support (tool|function|vision|image|json|structured)/i,
  // Context-window overruns surface under provider-specific envelopes
  // ("prompt is too long", 上游 11115, 上游拒绝超限请求) — a model with a
  // larger window in the rotation list can still serve the same turn.
  /prompt is too long/i,
  /prompt too long/i,
  /context length|context window|maximum context/i,
  /输入.*超过.*(上限|限制)/,
  /超过了模型上限/,
  /请求被上游拒绝/,
  /http 400.*上游|上游.*http 400/,
  // DNS / proxy / channel-network failures reported by channel wrappers.
  /ENOTFOUND/,
  /getaddrinfo/i,
  /网络请求失败/,
  /网络失败/,
  /代理连通/,
  /渠道网络/,
  // Account state and credentials. A disabled/banned/expired account cannot
  // serve the request from THIS route, but another provider (or another
  // account behind it) in the rotation list usually can — the same reason the
  // GUI reports "本轮运行失败账号已被禁用".
  /账号.{0,8}(已被?)?(禁用|封禁|停用|冻结|注销|锁定)/,
  /(已被?)?(禁用|封禁|冻结)的?账号/,
  /账号.{0,6}(异常|不可用|失效|过期|掉线|欠费)/,
  /(登录|登陆|凭据|凭证|令牌|授权|token|session).{0,8}(已)?(失效|过期|无效|被拒|被撤销|被吊销)/i,
  /(需要?|请)重新(登录|登陆|授权|认证)/,
  // preflight sign-in prompts thrown BEFORE dispatch (account adapter path)
  /请先(登录|登陆|授权|认证)/,
  /(登录|授权).{0,12}(并确认|后重试)/,
  /sign[ _]?in (to|required)/i,
  /未授权|无权限|无访问权限|鉴权失败|认证失败|授权失败|身份验证失败/,
  /(api[ _-]?key|密钥|key).{0,10}(无效|失效|错误|不合法|被拒)/i,
  /(invalid|expired|revoked|malformed).{0,16}(api[ _-]?key|token|credential|account|session)/i,
  /(account|user).{0,16}(has been |was |is )?(disabled|suspended|banned|blocked|locked|deactivated)/i,
  // bare "forbidden" is usually content-policy 403, not an outage: require 401/403 context
  /unauthori[sz]ed|permission denied|access denied|401|403.{0,20}(key|token|account|access|forbidden)/i,
  // Model/route availability: the route itself cannot serve any request.
  /模型.{0,6}(不可用|不存在|已下线|未找到|无权访问|已停用)/,
  /(model|deployment).{0,12}(not found|does not exist|unavailable|decommissioned|retired)/i,
  /(渠道|上游服务|服务|接口|响应).{0,4}(不可用|异常|故障|中断)/,
  /并发(限制|超限)|请求(过于|太)频繁|频率(限制|超限)|too many requests/i,
];

const DEFAULTS = Object.freeze({
  enabled: false,
  order: [],
  // One "round" = every model in the list has been tried once. Stop after
  // `maxCycles` complete cycles within `cycleWindowMs` (default: 3 rounds in
  // 30 minutes), meaning short-term all models are unavailable.
  maxCycles: 3,
  cycleWindowMs: 30 * 60 * 1000,
  catalog: [],
});

function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** The durable switch record: provider/model pairs in rotation order. */
function normalizeOrder(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of input) {
    if (entry === null || typeof entry !== 'object') continue;
    const provider = typeof entry.provider === 'string' ? entry.provider.trim() : '';
    const model = typeof entry.model === 'string' ? entry.model.trim() : '';
    if (provider.length === 0 || model.length === 0) continue;
    const key = `${provider}\u0000${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = { provider, model };
    if (typeof entry.reasoningEffort === 'string' && entry.reasoningEffort.trim().length > 0) {
      row.reasoningEffort = entry.reasoningEffort.trim();
    }
    out.push(row);
  }
  return out;
}

/** Display-only catalog snapshot (provider groups, names) for the composer UI. */
function normalizeCatalog(input) {
  if (!Array.isArray(input)) return [];
  const groups = [];
  for (const group of input) {
    if (group === null || typeof group !== 'object') continue;
    const id = typeof group.id === 'string' ? group.id.trim() : '';
    if (id.length === 0) continue;
    const models = Array.isArray(group.models)
      ? group.models
          .map((m) => (m && typeof m === 'object' && typeof m.id === 'string' && m.id.trim().length > 0
            ? {
                id: m.id,
                name: typeof m.name === 'string' && m.name.trim().length > 0 ? m.name : m.id,
                ...(Array.isArray(m.badges) && m.badges.length > 0
                  ? { badges: m.badges.filter((b) => typeof b === 'string' && b.length > 0) }
                  : {}),
              }
            : null))
          .filter(Boolean)
      : [];
    groups.push({ id, name: typeof group.name === 'string' && group.name.trim().length > 0 ? group.name : id, models });
  }
  return groups;
}

/** Per-session enablement overrides: sessionId → true/false. */
function normalizeSessionOverrides(input) {
  if (input === null || typeof input !== 'object') return {};
  const out = {};
  for (const [sessionId, enabled] of Object.entries(input)) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) continue;
    if (typeof enabled === 'boolean') out[sessionId] = enabled;
  }
  return out;
}

function normalize(input = {}) {
  return {
    enabled: input.enabled === true,
    sessionOverrides: normalizeSessionOverrides(input.sessionOverrides),
    order: normalizeOrder(input.order),
    maxCycles: clampInt(input.maxCycles, 1, 20, DEFAULTS.maxCycles),
    cycleWindowMs: clampInt(input.cycleWindowMs, 60_000, 24 * 60 * 60 * 1000, DEFAULTS.cycleWindowMs),
    catalog: normalizeCatalog(input.catalog),
  };
}

function loadConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) return { ...DEFAULTS };
    const raw = readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/u, '');
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

function persistConfig(next) {
  try {
    mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    const temporary = `${CONFIG_FILE}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporary, serialized, 'utf8');
    try {
      renameSync(temporary, CONFIG_FILE);
    } catch {
      try {
        rmSync(CONFIG_FILE, { force: true });
      } catch {
        /* ignore */
      }
      try {
        renameSync(temporary, CONFIG_FILE);
      } catch {
        writeFileSync(CONFIG_FILE, serialized, 'utf8');
      }
    }
  } catch {
    /* configuration is best-effort; the in-memory value still applies */
  }
}

/** The live configuration read by every recovery decision. */
let config = loadConfig();

/**
 * Ring of switch timestamps per SESSION, one entry per rotation step. Sessions
 * have independent cycle budgets — one session exhausting its window must not
 * stop another session's rotation. Trimmed to keep memory flat.
 */
const switchLogs = new Map(); // sessionId → number[]

function sessionSwitchLog(sessionId) {
  let log = switchLogs.get(sessionId);
  if (log === undefined) {
    log = [];
    switchLogs.set(sessionId, log);
  }
  return log;
}

function resetSwitchLog(sessionId) {
  if (sessionId === undefined || sessionId === null || sessionId === '') {
    switchLogs.clear();
    return;
  }
  switchLogs.delete(sessionId);
}

/**
 * Whether one more full cycle is allowed FOR THIS SESSION. A full cycle =
 * `order.length` consecutive switches. We count completed cycles inside the
 * window; if the number of complete cycles already at or above `maxCycles`
 * within the window, stop rotating.
 */
function cycleBudgetAvailable(sessionId, orderLength) {
  if (orderLength <= 0) return false;
  const windowStart = Date.now() - config.cycleWindowMs;
  const recent = sessionSwitchLog(sessionId).filter((t) => t >= windowStart);
  const completedCycles = Math.floor(recent.length / orderLength);
  return completedCycles < config.maxCycles;
}

function recordSwitch(sessionId) {
  const now = Date.now();
  const log = sessionSwitchLog(sessionId);
  log.push(now);
  const keep = Math.max(config.order.length * (config.maxCycles + 1), 64);
  if (log.length > keep) switchLogs.set(sessionId, log.slice(-keep));
}

/** Cycle count for display — per session when known, aggregate otherwise. */
function cycleCountFor(sessionId) {
  const windowStart = Date.now() - config.cycleWindowMs;
  const logs = sessionId !== undefined && sessionId !== null && sessionId !== ''
    ? [sessionSwitchLog(sessionId)]
    : [...switchLogs.values()];
  const recent = logs.reduce((sum, log) => sum + log.filter((t) => t >= windowStart).length, 0);
  return Math.floor(recent / Math.max(config.order.length, 1));
}

/**
 * Per-session enablement. The rotation list is shared, but whether rotation is
 * ON — and how far it has cycled — belongs to each conversation. Overrides
 * persist in the config file under `sessionOverrides`; absent entry falls
 * back to the global `enabled` (default off).
 */
function sessionEnabledFor(sessionId) {
  if (sessionId === undefined || sessionId === null || sessionId === '') return config.enabled;
  return config.sessionOverrides?.[sessionId] ?? config.enabled;
}

function setSessionEnabled(sessionId, enabled) {
  const overrides = { ...(config.sessionOverrides ?? {}) };
  if (typeof sessionId !== 'string' || sessionId.length === 0) return config;
  if (enabled === null || enabled === undefined) delete overrides[sessionId];
  else overrides[sessionId] = enabled === true;
  return { ...config, sessionOverrides: overrides };
}

/**
 * Read the latest durable selection for the agent — the composer's effective
 * route. Resolution order matches the session-controller's own selection
 * object: pending projection → lastUsed projection → folded request header →
 * deployment default. `stateOf` returns the raw projected state
 * {lastUsed, pending} (the wire view's `next` is derived only for the client
 * transport), so read pending ?? lastUsed here.
 */
function durableSelection(ctx, agent) {
  try {
    // Kernel 0.2.x: AgentModel.current() IS the canonical read (recorded
    // pending ?? lastUsed, else live route options). Prefer it over poking
    // the projection directly.
    const modelApi = agent.model;
    if (typeof modelApi?.current === 'function') {
      const current = modelApi.current();
      if (current !== undefined && current !== null && current.provider && current.model) return current;
    }
    const state = ctx.sessionProjections.stateOf(agent.session, 'modelSelection');
    const projected = state?.pending ?? state?.lastUsed;
    if (projected !== undefined && projected !== null) return projected;
    const header = agent.session.requestHeader?.();
    if (header?.config?.provider && header.config.model) {
      return {
        provider: header.config.provider,
        model: header.config.model,
        ...(header.config.reasoningEffort === undefined || header.adapterDefaults?.reasoningEffort === true
          ? {}
          : { reasoningEffort: header.config.reasoningEffort }),
      };
    }
    const defaultModel = ctx.get?.('agentDefaultModel');
    const selection = defaultModel?.currentSelection?.();
    return selection?.provider ? selection : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Classify a model-request failure as worth rotating on. Codes route first
 * (never parse message text when a stable code exists); wording catches
 * provider-specific envelopes like 429 soft_rate bodies.
 */
/**
 * Kernel/internal invariant failures: a structural contract violation inside
 * the loop (frozen-route mismatch, a missing symbol, no route configured).
 * These are NEVER a model outage — rotating cannot fix them and only burns
 * the cycle budget re-throwing on the same broken route. Checked FIRST, before
 * any code or wording rule, so an invariant message that happens to name a
 * model or say "upstream" cannot accidentally trigger a rotation. Surfaced
 * (next()) so the user sees the real cause instead of a silent model shuffle.
 */
const INTERNAL_INVARIANT_TEXT = [
  /after step preparation fixed/i,
  /use agent\.model\.select\(\) before step preparation/i,
  /agent\/request proposed .* after step/i,
  /is not defined\b.*rotateToNext|rotateToNext is not defined/i,
  /has no provider\/model: set AgentOptions/i,
  /\bReferenceError\b|\bTypeError\b.*agent\/request|step outside running phase|pre-step outside running phase/,
];

function isInternalInvariant(failure) {
  if (failure === null || typeof failure !== 'object') return false;
  const text = typeof failure.message === 'string' ? failure.message : '';
  return INTERNAL_INVARIANT_TEXT.some((re) => re.test(text));
}

function isModelSideFailure(failure) {
  if (failure === null || typeof failure !== 'object') return false;
  // Internal invariant errors are a distinct class: never model-side.
  if (isInternalInvariant(failure)) return false;
  const code = typeof failure.code === 'string' ? failure.code.toUpperCase() : 'UNKNOWN';
  if (code === 'ABORTED') return false;
  if (code === 'IMAGE_OFFLOAD_REQUIRED') return false;
  // CONTEXT_WINDOW_EXCEEDED: compaction tries first (its listener precedes
  // this one), so reaching us means the prompt still does not fit. Rotate in
  // plain list order like any other failure — no capacity comparison. Provider
  // envelopes that wrap the same overflow in an odd code (workbuddy 11115 ->
  // code "client") arrive through the wording rules below.
  if (code === 'CONTEXT_WINDOW_EXCEEDED') return true;
  if (MODEL_SIDE_CODES.has(code)) {
    // QUOTA/ACCOUNT_QUOTA and AUTH are always model-side. TRANSPORT/SERVER/etc
    // route by code; UNKNOWN only counts when the wording agrees.
    if (code !== 'UNKNOWN') return true;
  }
  const text = typeof failure.message === 'string' ? failure.message : '';
  // A user cancellation or a content-policy rejection is not a model outage,
  // even when the envelope also mentions an account or a model.
  if (NOT_MODEL_SIDE_TEXT.some((re) => re.test(text))) return false;
  return MODEL_SIDE_TEXT.some((re) => re.test(text));
}

/**
 * Wording that must NOT rotate even though it mentions an account/model:
 * the prompt is the problem, or the user asked for the stop. These are checked
 * BEFORE the account/model rules so a legitimate cancellation or a content
 * problem never burns the cycle budget.
 */
const NOT_MODEL_SIDE_TEXT = [
  /用户(取消|中断|中止)/,
  /(取消|停止)了?(本轮|请求|生成)/,
  /you (cancelled|stopped|aborted)|request (was )?(cancelled|aborted)/i,
  /内容(审核|安全|违规)|content (policy|filter|moderation)/i,
  /上下文(压缩|整理)中/,
];

function findInOrder(selection) {
  if (selection === null || typeof selection !== 'object') return -1;
  return config.order.findIndex(
    (row) => row.provider === selection.provider && row.model === selection.model,
  );
}


/**
 * Install one model selection through the kernel's official path
 * (agent.model.select(), 0.2.x): it appends the durable `model/selection`
 * event, which the projection folds and every later step preparation reads
 * back through model.current().
 *
 * History of why the switch must go through the official durable path, never
 * a raw append alone or an agent/request rewrite: (a) a raw append advanced
 * the projection but left the OLD kernel's controller-side picked stale, so
 * the next assembly reverted to the failed model ("rotated model doesn't
 * actually work"); (b) an agent/request provider/model rewrite violated the
 * 0.2.x per-step frozen-selection invariant and threw
 * "agent/request proposed X after step preparation fixed Y". select() is the
 * documented entry point and avoids both.
 *
 * NO liveness precheck here, by design: every candidate must go through the
 * complete failure-detection flow on its own — the official dsh-llm-retry
 * budget (all retries with exponential backoff up to the 10 s cap, 429 /
 * quota / rate-limit envelopes included) runs per provider BEFORE the failure
 * ever reaches this plugin, and only a budget-exhausted model-side failure
 * rotates onward. Catalog-based pre-skipping (the previous lenient check)
 * judged models without a single real request and skipped actually-working
 * ones; a candidate is now judged dead only by its own request outcome.
 *
 * The one silent adjustment: an unsupported stored reasoningEffort is degraded
 * to the adapter default when capabilities are resolvable — retrying an
 * effort-id mismatch is never a model outage.
 */
async function applySelection(ctx, agent, row) {
  let effort = row.reasoningEffort;
  if (effort !== undefined) {
    try {
      const info = await ctx.llm.resolveModelInfo(row.provider, row.model);
      const reasoning = info?.reasoning;
      if (reasoning !== undefined && !reasoning.efforts.some((candidate) => candidate.id === effort)) {
        effort = reasoning.defaultEffort;
      }
    } catch {
      // Unknown capabilities — keep the stored effort; the request decides.
    }
  }
  const selection = {
    provider: row.provider,
    model: row.model,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  };
  // Kernel 0.2.x contract: the official switch API is agent.model.select()
  // (AgentModel in @deepseek-ai/dsh-agent): it dedups against the recorded
  // selection and appends the same durable `model/selection` event. The
  // session-controller's selectForNextRequest/consumeSelection facade existed
  // only in the previous kernel and is GONE — calling it silently fell into
  // the append fallback while nothing updated the step-fixed route, and the
  // old agent/request pin then fought the kernel's new per-step frozen
  // selection invariant ("agent/request proposed X after step preparation
  // fixed Y; use agent.model.select() before step preparation"). Use the
  // documented entry point so the NEXT step prepares on the new route.
  if (typeof agent.model?.select === 'function') {
    agent.model.select(selection);
  } else {
    // Fallback (older kernel without AgentModel): the raw durable event.
    agent.session.append('model/selection', selection);
  }
  // The new route starts with a FULL retry budget: the official llm-retry
  // counter is keyed by [provider, policyKey], so a same-provider switch can
  // inherit the OLD model's exhausted count. We deliberately DO NOT reset it
  // by appending a synthetic llm/retry event: the replay validator for that
  // event type requires coordinates matching the currently open turn/step,
  // contiguous chain numbering, and a stable retryId — a fabricated retry:0
  // event passes the runtime projection (which does not check coordinates)
  // but corrupts the durable log so the WHOLE session history fails to load
  // (observed in the field: 41 poisoned records, session unopenable).
  // There is no legal event-driven budget reset under current kernel
  // semantics. The kernel's own step/start event zeroes the retry state at
  // the next step boundary, which is the correct (and only) reset path.
  return selection;
}

/**
 * Rotate to the next model in list order. No candidate filtering: every model
 * gets the full request + retry flow; a candidate that exhausts its own retry
 * budget rotates past on its next failure.
 */
async function rotateToNext(ctx, agent, currentIndex) {
  const orderLength = config.order.length;
  for (let offset = 1; offset <= orderLength; offset += 1) {
    const row = config.order[(currentIndex + offset) % orderLength];
    const isSameRoute = currentIndex >= 0
      && row.provider === config.order[currentIndex].provider
      && row.model === config.order[currentIndex].model;
    if (isSameRoute) continue;
    try {
      const selection = await applySelection(ctx, agent, row);
      return { row, selection };
    } catch (error) {
      ctx.logger?.warn?.(
        `[model-rotation] candidate ${row.provider}/${row.model} failed to install: ${String(error instanceof Error ? error.message : error).slice(0, 160)}`,
      );
    }
  }
  return undefined;
}

function registerRecovery(ctx) {
  ctx.on('agent/request-error', async (payload, next) => {
    const { agent, failure } = payload ?? {};
    // Per-session enablement: agent.id IS the session id (agents.get(sessionId) === agent).
    const sessionId = agent?.id;
    if (!sessionEnabledFor(sessionId) || agent === undefined) return next();
    if (!isModelSideFailure(failure)) return next();
    const orderLength = config.order.length;
    if (orderLength === 0) return next();
    if (orderLength === 1) return next(); // nothing to rotate to; avoid a pointless validation call
    const current = durableSelection(ctx, agent);
    const currentIndex = current === undefined ? -1 : findInOrder(current);
    if (!cycleBudgetAvailable(sessionId, orderLength)) {
      ctx.logger?.warn?.(
        `[model-rotation] rotation stopped for session ${sessionId}: ${config.maxCycles} full cycles within ${Math.round(config.cycleWindowMs / 60000)} min — all models unavailable short-term`,
      );
      return next();
    }
    const rotated = await rotateToNext(ctx, agent, currentIndex);
    if (rotated === undefined) {
      ctx.logger?.warn?.('[model-rotation] no valid rotation candidate (all rejected by resolveCallConfig)');
      return next();
    }
    recordSwitch(sessionId);
    ctx.logger?.warn?.(
      `[model-rotation] model failure (${failure?.code ?? 'UNKNOWN'}: ${String(failure?.message ?? '').slice(0, 160)}) — rotated to ${rotated.selection.provider}/${rotated.selection.model} (step ${payload.turn}/${payload.step})`,
    );
    // Kernel 0.2.x freezes the step's route in decision.selection, and the
    // agent/request waterfall is FORBIDDEN to change it (that check is what
    // produced "agent/request proposed X after step preparation fixed Y").
    // A returned retry therefore only re-runs on the NEW route if the frozen
    // selection object itself carries it. preStep passes modelSelection into
    // agent/pre-step and reuses that exact object for every attempt of the
    // step, so we mutate the captured one (identity- and position-checked) —
    // the only legal in-step switch. When no trustworthy capture exists we
    // still keep the durable rotation and let the failure surface: the next
    // step or message starts on the working model instead of burning the
    // cycle budget re-throwing on a dead route.
    if (applyStepRouteSwap(agent, payload.turn, payload.step, rotated.selection)) {
      return { kind: 'retry' };
    }
    ctx.logger?.warn?.(
      `[model-rotation] no step-scoped selection capture for step ${payload.turn}/${payload.step} — route rotated for the next step; surfacing this failure instead of retrying a frozen dead route`,
    );
    return next();
  });
}

/**
 * Step-scoped selection capture. agent/pre-step receives the very object the
 * loop re-reads for every attempt of that step (preStep: `const selection =
 * this.model.current()` → payload.modelSelection → decision.selection). We
 * remember it per agent with its turn/step so a rotation can mutate it in
 * place — the only way an in-step retry can leave the dead route.
 */
const stepSelections = new WeakMap(); // agent → { turn, step, selection }

function captureStepSelection(agent, payload) {
  try {
    const selection = payload?.modelSelection;
    if (agent === undefined || selection === null || typeof selection !== 'object') return;
    stepSelections.set(agent, {
      turn: payload.turn,
      step: payload.step,
      selection,
    });
  } catch {
    /* capture is best-effort */
  }
}

/**
 * Swap the frozen step selection to the rotated route. Returns true only when
 * a capture for THIS exact turn/step exists and the mutation landed — the
 * caller uses that to decide between retry and surfacing.
 */
function applyStepRouteSwap(agent, turn, step, selection) {
  try {
    const captured = stepSelections.get(agent);
    if (captured === undefined) return false;
    if (captured.turn !== turn || captured.step !== step) return false;
    const target = captured.selection;
    if (target === null || typeof target !== 'object') return false;
    target.provider = selection.provider;
    target.model = selection.model;
    if (selection.reasoningEffort === undefined) delete target.reasoningEffort;
    else target.reasoningEffort = selection.reasoningEffort;
    return target.provider === selection.provider && target.model === selection.model;
  } catch {
    return false;
  }
}

/**
 * Second recovery channel: errors thrown BEFORE the stream attempt starts
 * (adapter preflight: account quota exhausted, sign-in required, credential
 * rejection) bypass the agent/request-error waterfall entirely — the loop
 * rethrows them out of step() and reports via the `agent/error` EMIT, which
 * carries no recovery decision. "本轮运行失败当前请求的额度已用尽" is exactly
 * this path (QUOTA remapped to ACCOUNT_QUOTA by the account adapter before
 * dispatch).
 *
 * We cannot retry the dead turn from an emit, but we can do the next best
 * thing: rotate the durable selection NOW, so the user's next message (or a
 * manual resend) dispatches on a working model instead of the dead route.
 * The cycle budget and per-session enablement gate this channel identically.
 */
function registerErrorWatch(ctx) {
  ctx.on('agent/error', async (payload) => {
    try {
      const { agent, error } = payload ?? {};
      if (agent === undefined) return;
      const sessionId = agent.id;
      if (!sessionEnabledFor(sessionId)) return;
      const orderLength = config.order.length;
      if (orderLength < 2) return;
      // Rebuild the structured failure the classifier expects: LlmError keeps
      // .code/.failure; plain errors fall back to message-wording detection.
      const failure = error?.failure ?? {
        code: typeof error?.code === 'string' ? error.code : 'UNKNOWN',
        message: String(error?.message ?? error ?? ''),
      };
      // A kernel invariant violation (frozen-route mismatch, missing symbol,
      // no route) is detected and logged here but NEVER rotated: it is a
      // structural bug, and rotating re-throws on the same broken route.
      if (isInternalInvariant(failure)) {
        ctx.logger?.warn?.(
          `[model-rotation] kernel invariant failure detected (not a model outage, no rotation): ${String(failure.message ?? '').slice(0, 200)}`,
        );
        return;
      }
      if (!isModelSideFailure(failure)) return;
      const current = durableSelection(ctx, agent);
      const currentIndex = current === undefined ? -1 : findInOrder(current);
      if (!cycleBudgetAvailable(sessionId, orderLength)) {
        ctx.logger?.warn?.(
          `[model-rotation] pre-stream failure for session ${sessionId} but the cycle budget is exhausted — route unchanged`,
        );
        return;
      }
      const rotated = await rotateToNext(ctx, agent, currentIndex);
      if (rotated === undefined) return;
      recordSwitch(sessionId);
      ctx.logger?.warn?.(
        `[model-rotation] pre-stream failure (${failure?.code ?? 'UNKNOWN'}: ${String(failure?.message ?? '').slice(0, 160)}) — turn lost, rotated route to ${rotated.selection.provider}/${rotated.selection.model} for the next request (session ${sessionId})`,
      );
    } catch {
      /* the watch must never break the error reporting it observes */
    }
  });
}

/**
 * Per-model reasoning-effort compatibility cache. resolveModelInfo is cheap
 * per provider but not free; effort ids rarely change.
 */
const effortCompatCache = new Map(); // key: provider\u0000model → Set(supported effort ids) | 'unknown'

async function supportedEfforts(ctx, provider, model) {
  const key = `${provider}\u0000${model}`;
  const cached = effortCompatCache.get(key);
  if (cached !== undefined) return cached;
  let result = 'unknown';
  try {
    const info = await ctx.llm.resolveModelInfo(provider, model);
    const reasoning = info?.reasoning;
    if (reasoning !== undefined && Array.isArray(reasoning.efforts)) {
      result = new Set(reasoning.efforts.map((effort) => effort.id));
      if (result.size === 0) result = 'unknown';
    }
    // reasoning === undefined → the model takes no effort at all; callers
    // must STRIP the effort rather than pick a default.
    if (reasoning === undefined) result = new Set();
  } catch {
    // Transient capability failure: do NOT cache 'unknown' — a poisoned cache
    // would pass incompatible efforts through forever.
    return 'unknown';
  }
  effortCompatCache.set(key, result);
  return result;
}



/**
 * Pin the newest durable selection onto every request the loop builds. The
 * session-controller's own selection object also feeds assembly, but a retry
 * inside one open turn reuses the step's assembled snapshot; the override here
 * guarantees the rotated route is what actually dispatches. Also normalizes
 * the reasoning effort of whatever route wins (rotated or hand-picked) so
 * effort-incompatible models degrade instead of failing the turn.
 */
/**
 * Kernel 0.2.x route contract (read from dsh-agent-loop source):
 *   - preStep reads agent.model.current() ONCE and freezes it into
 *     decision.selection; every attempt of that step reuses it.
 *   - the agent/request waterfall is FORBIDDEN to change provider/model, and
 *     separately forbidden to change reasoningEffort. A violation throws
 *     `agent/request proposed "X/Y" after step preparation fixed "A/B"; use
 *     agent.model.select() before step preparation` and kills the turn.
 *
 * The previous agent/request listener (pending-pin + effort compat rewrite)
 * was exactly that violation — it is why available models died with this
 * error. It is removed. Route and effort changes are now recorded through the
 * documented entry point agent.model.select(), which takes effect at the NEXT
 * step preparation (the only legal timing).
 */
function registerSelectionHygiene(ctx) {
  // Fix an unsupported recorded effort BEFORE the step freezes it: append a
  // corrected selection via agent.model.select() during pre-step, so the next
  // step prepares on a compatible route instead of dying in prepareCall.
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    try {
      const { agent, modelSelection } = payload ?? {};
      // Capture the frozen step selection FIRST: model.current() returns a
      // fresh shallow copy at preStep, and preStep reuses that exact object as
      // decision.selection for every attempt of this step. Remembering it lets
      // a later rotation mutate the route in place (applyStepRouteSwap).
      captureStepSelection(agent, payload);
      if (agent === undefined || modelSelection === null || typeof modelSelection !== 'object') return decision;
      if (modelSelection.reasoningEffort === undefined) return decision;
      const supported = await supportedEfforts(ctx, modelSelection.provider, modelSelection.model);
      if (supported === 'unknown' || supported.has(modelSelection.reasoningEffort)) return decision;
      let fallback;
      if (supported.size === 0) fallback = undefined; // non-reasoning model: strip effort
      else {
        fallback = supported.values().next().value;
        try {
          const info = await ctx.llm.resolveModelInfo(modelSelection.provider, modelSelection.model);
          if (info?.reasoning?.defaultEffort !== undefined && supported.has(info.reasoning.defaultEffort)) {
            fallback = info.reasoning.defaultEffort;
          }
        } catch { /* use first supported */ }
      }
      ctx.logger?.warn?.(
        `[model-rotation] effort "${modelSelection.reasoningEffort}" unsupported by ${modelSelection.provider}/${modelSelection.model} — corrected to ${fallback ?? '(none)'}`,
      );
      // Fix the CURRENT step's frozen copy in place (so prepareCall does not
      // throw UNSUPPORTED_REASONING_EFFORT on this attempt), then record the
      // corrected selection durably for subsequent steps via the official API.
      if (fallback === undefined) delete modelSelection.reasoningEffort;
      else modelSelection.reasoningEffort = fallback;
      if (typeof agent.model?.select === 'function') {
        const durable = fallback === undefined
          ? { provider: modelSelection.provider, model: modelSelection.model }
          : { provider: modelSelection.provider, model: modelSelection.model, reasoningEffort: fallback };
        agent.model.select(durable);
      }
    } catch {
      /* hygiene must never break the step */
    }
    return decision;
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function success(rpcId, value) {
  return jsonResponse({ type: 'server-response', rpcId, result: { ok: true, value } });
}

function failure(rpcId, code, message) {
  return jsonResponse({
    type: 'server-response',
    rpcId,
    result: { ok: false, error: { code, message, details: {} } },
  });
}

/**
 * Billing badges (夜间免费/限时免费/订阅优先/…) exposed by the workbuddy
 * connect plugin's local catalog caches. The DSH llm layer itself does not
 * carry badge metadata, so we merge it in from the catalog files the plugin
 * maintains. These caches describe WORKBUDDY-family accounts only — other
 * providers (qoder/trae/cline/raccoon) bake their multiplier/免费 wording
 * into listModels names already — so the merge is scoped to workbuddy
 * provider ids, preventing an id like "deepseek-v4.1-flash" from carrying a
 * workbuddy badge onto trae. Shape-tolerant: any unreadable/missing piece
 * degrades to no badges, never an error.
 */
function readWorkbuddyBadges() {
  const badgesByModel = new Map(); // modelId → string[]
  try {
    const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
    for (const file of ['.workbuddy-catalog.json', '.workbuddy-ai-catalog.json']) {
      const catalogFile = path.join(dshHome, file);
      if (!existsSync(catalogFile)) continue;
      try {
        const raw = JSON.parse(readFileSync(catalogFile, 'utf8').replace(/^\uFEFF/u, ''));
        const entries = raw?.entries;
        if (entries === null || typeof entries !== 'object') continue;
        for (const entry of Object.values(entries)) {
          for (const model of entry?.models ?? []) {
            if (typeof model?.id !== 'string') continue;
            const badges = Array.isArray(model?.billing?.badges)
              ? model.billing.badges.filter((b) => typeof b === 'string' && b.length > 0)
              : [];
            // free=true adds a 免费 chip only when no existing badge already
            // says 免费 (限时免费/独家限免 cover it).
            if (model?.billing?.free === true && !badges.some((b) => b.includes('免费') || b.includes('限免'))) {
              badges.unshift('免费');
            }
            if (badges.length > 0) {
              const existing = badgesByModel.get(model.id) ?? [];
              for (const badge of badges) if (!existing.includes(badge)) existing.push(badge);
              badgesByModel.set(model.id, existing);
            }
          }
        }
      } catch {
        /* one unreadable catalog file must not break the other */
      }
    }
    // Multi-account merge can stack a bare 免费 next to 限时免费/独家限免.
    // Keep the specific badge; drop the generic one when a specific exists.
    for (const [id, badges] of badgesByModel) {
      if (badges.length > 1 && badges.includes('免费') && badges.some((b) => b !== '免费' && (b.includes('免费') || b.includes('限免')))) {
        badgesByModel.set(id, badges.filter((b) => b !== '免费'));
      }
    }
  } catch {
    /* badges are display sugar; absence is fine */
  }
  return badgesByModel;
}

/** Build the display catalog from the live llm service (all providers/models). */
async function buildCatalog(llm) {
  const groups = [];
  try {
    const providers = llm.listProviders();
    const badges = readWorkbuddyBadges();
    for (const provider of providers) {
      const id = provider.id;
      const badgeScope = /workbuddy/i.test(id);
      let models = [];
      try {
        const listed = await llm.listModels(id);
        models = listed.map((m) => ({
          id: m.id,
          name: m.name,
          ...(badgeScope && badges.has(m.id) ? { badges: badges.get(m.id) } : {}),
        }));
      } catch {
        models = [];
      }
      groups.push({ id, name: provider.displayName ?? id, models });
    }
  } catch {
    /* catalog is best-effort */
  }
  return groups;
}

function publicConfig(sessionId) {
  return {
    ...config,
    switchLog: (sessionId !== undefined && sessionId !== null && sessionId !== ''
      ? sessionSwitchLog(sessionId)
      : [...switchLogs.values()].flat()
    ).map((t) => new Date(t).toISOString()),
    cycleCount: cycleCountFor(sessionId),
    // The enablement state that matters to THIS session (override or global).
    enabled: sessionEnabledFor(sessionId),
  };
}

/**
 * The composer's current model: read from the session's modelSelection
 * projection — the same state the Web model picker renders from.
 */
/**
 * The composer's current model — resolved exactly like the session-controller
 * resolves its selection: pending projection first, then lastUsed, then the
 * folded request header (a session that has already run requests but has no
 * pending selection), then the deployment default model. A fresh session
 * therefore reports its effective route instead of null.
 */
function currentSelectionFor(sessionId) {
  try {
    const ctx = ctxRef;
    if (ctx === undefined) return { current: null };
    const agents = ctx.get?.('agents');
    const agent = typeof sessionId === 'string' && agents !== undefined ? agents.get(sessionId) : undefined;
    if (agent === undefined) return { current: null };
    const modelApi = agent.model;
    if (typeof modelApi?.current === 'function') {
      const current = modelApi.current();
      if (current !== undefined && current !== null && current.provider && current.model) return { current };
    }
    const state = ctx.sessionProjections.stateOf(agent.session, 'modelSelection');
    const projected = state?.pending ?? state?.lastUsed;
    if (projected !== undefined && projected !== null) return { current: projected };
    // Fallback 1: the last durable request header — the route the next request
    // would inherit.
    const header = agent.session.requestHeader?.();
    if (header?.config?.provider && header.config.model) {
      return {
        current: {
          provider: header.config.provider,
          model: header.config.model,
          ...(header.config.reasoningEffort === undefined || header.adapterDefaults?.reasoningEffort === true
            ? {}
            : { reasoningEffort: header.config.reasoningEffort }),
        },
      };
    }
    // Fallback 2: the deployment default (what the first request would use).
    const defaultModel = ctx.get?.('agentDefaultModel');
    const selection = defaultModel?.currentSelection?.();
    if (selection?.provider && selection.model) return { current: selection };
    return { current: null };
  } catch {
    return { current: null };
  }
}

/**
 * One-call description of the session's ACTUAL current route, resolved for
 * display: provider, model id, the catalog display name (which already carries
 * the multiplier / 免费 wording), the provider's display name and any billing
 * badges. Resolution follows the same chain as currentSelectionFor, so the
 * badge never shows a route the next request would not use.
 */
async function describeCurrent(ctx, sessionId) {
  const resolved = currentSelectionFor(sessionId);
  const selection = resolved.current;
  if (selection === null || selection === undefined) return { current: null };

  let providerName;
  let modelName = selection.model;
  let badges = [];
  try {
    const llm = ctx.llm;
    const provider = llm.listProviders().find((entry) => entry.id === selection.provider);
    if (provider !== undefined) providerName = provider.displayName ?? provider.id;
    const listed = await llm.listModels(selection.provider);
    const found = listed.find((model) => model.id === selection.model);
    if (found !== undefined && typeof found.name === 'string') modelName = found.name;
    if (/workbuddy/i.test(selection.provider)) {
      const badgeMap = readWorkbuddyBadges();
      if (badgeMap.has(selection.model)) badges = badgeMap.get(selection.model);
    }
  } catch {
    /* display is best-effort: fall back to the raw route */
  }
  return {
    current: {
      provider: selection.provider,
      providerName: providerName ?? selection.provider,
      model: selection.model,
      modelName,
      badges,
      ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
    },
  };
}

const execFileAsync = promisify(execFile);

async function pickNative() {
  if (process.platform !== 'win32') throw new Error('native picker only on Windows');
  const script = `Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Select config file'
$dialog.Filter = 'All files (*.*)|*.*'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.FileName) }`;
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const powershellPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await execFileAsync(
    existsSync(powershellPath) ? powershellPath : 'powershell.exe',
    ['-NoLogo', '-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-Command', script],
    { timeout: 300000, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  return stdout.trim() || null;
}

async function handleRpc(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('invalid JSON request body', { status: 400 });
  }
  if (
    body === null
    || typeof body !== 'object'
    || body.type !== 'client-request'
    || typeof body.rpcId !== 'string'
    || typeof body.method !== 'string'
  ) {
    return new Response('invalid client-request envelope', { status: 400 });
  }
  if (body.method !== RPC_METHOD) return new Response('unknown RPC method', { status: 400 });
  const wrapped = body.payload;
  if (wrapped === null || typeof wrapped !== 'object' || typeof wrapped.endpoint !== 'string') {
    return failure(body.rpcId, 'invalid-request', 'payload must be { endpoint, payload }');
  }
  try {
    // Every endpoint accepts an optional sessionId: when present, enablement
    // and the cycle log are scoped to THAT conversation (per-session state),
    // while the list/items and window settings stay globally shared.
    const sessionId = typeof wrapped.payload?.sessionId === 'string' ? wrapped.payload.sessionId : undefined;
    if (wrapped.endpoint === 'get') {
      return success(body.rpcId, publicConfig(sessionId));
    }
    if (wrapped.endpoint === 'catalog') {
      const llm = ctxRef?.llm;
      const catalog = llm === undefined ? config.catalog : await buildCatalog(llm);
      config = normalize({ ...config, catalog });
      persistConfig(config);
      return success(body.rpcId, { catalog, ...publicConfig(sessionId) });
    }
    if (wrapped.endpoint === 'set') {
      const patch = { ...(wrapped.payload ?? {}) };
      delete patch.sessionId;
      // Per-session enablement goes through setSession, never into the
      // global config.enabled.
      if (Object.hasOwn(patch, 'sessionEnabled')) {
        const next = setSessionEnabled(sessionId, patch.sessionEnabled);
        delete patch.sessionEnabled;
        config = normalize({ ...next, ...patch });
        persistConfig(config);
        return success(body.rpcId, publicConfig(sessionId));
      }
      const next = normalize({ ...config, ...patch });
      // Reorder/same length? keep the rotation pointer consistent: nothing to
      // do, the order is the state. Reset cycle logs only when the list
      // membership actually changed, so edits keep their budget. The log is
      // per session — reset every session's budget together with the shared
      // list change.
      const before = JSON.stringify(config.order);
      const after = JSON.stringify(next.order);
      if (before !== after) resetSwitchLog();
      config = next;
      persistConfig(config);
      return success(body.rpcId, publicConfig(sessionId));
    }
    if (wrapped.endpoint === 'reset') {
      // Reset THIS session's cycle record (no sessionId → all sessions).
      resetSwitchLog(sessionId);
      return success(body.rpcId, publicConfig(sessionId));
    }
    if (wrapped.endpoint === 'use') {
      // "设为当前模型": install a rotation-list row as the session's active
      // model through the official selection path — the composer model picker
      // syncs automatically, and the next rotation continues from this row.
      const index = Number(wrapped.payload?.index);
      const row = Number.isInteger(index) && index >= 0 && index < config.order.length
        ? config.order[index]
        : undefined;
      if (row === undefined) {
        return failure(body.rpcId, 'invalid-request', `no rotation row at index ${wrapped.payload?.index}`);
      }
      const ctx = ctxRef;
      if (ctx === undefined) return failure(body.rpcId, 'not-ready', 'host context unavailable');
      const agents = ctx.get?.('agents');
      const agent = typeof sessionId === 'string' && agents !== undefined ? agents.get(sessionId) : undefined;
      if (agent === undefined) {
        return failure(body.rpcId, 'session-unavailable', `no live agent for session ${sessionId ?? '(unknown)'}`);
      }
      const selection = await applySelection(ctx, agent, row);
      return success(body.rpcId, { current: selection, ...publicConfig(sessionId) });
    }
    if (wrapped.endpoint === 'current') {
      return success(body.rpcId, currentSelectionFor(wrapped.payload?.sessionId));
    }
    if (wrapped.endpoint === 'describe') {
      const ctx = ctxRef;
      if (ctx === undefined) return failure(body.rpcId, 'not-ready', 'host context unavailable');
      return success(body.rpcId, await describeCurrent(ctx, sessionId));
    }
    if (wrapped.endpoint === 'pickFile') {
      return success(body.rpcId, await pickNative());
    }
    return failure(body.rpcId, 'unknown-endpoint', `unknown endpoint ${wrapped.endpoint}`);
  } catch (error) {
    return failure(body.rpcId, 'model-rotation-failed', String(error?.message ?? error));
  }
}

let ctxRef = undefined;

export function apply(ctx) {
  ctxRef = ctx;
  persistConfig(config);
  ctx.logger?.info?.(`[model-rotation] config: ${JSON.stringify({ enabled: config.enabled, order: config.order.length, maxCycles: config.maxCycles })}`);
  registerRecovery(ctx);
  registerErrorWatch(ctx);
  registerSelectionHygiene(ctx);

  ctx.inject(['connection'], (scope) => {
    scope.effect(() => {
      const dispose = scope.connection.fetch.register({
        path: RPC_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handleRpc(request),
      });
      ctx.logger?.info?.(`[model-rotation] RPC registered: ${RPC_PATH}`);
      return () => dispose();
    }, 'model-rotation: RPC route');
  });
}
