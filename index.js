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
  'INVALID_REQUEST',
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
  /upstream/i,
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
function isModelSideFailure(failure) {
  if (failure === null || typeof failure !== 'object') return false;
  const code = typeof failure.code === 'string' ? failure.code.toUpperCase() : 'UNKNOWN';
  if (code === 'ABORTED') return false;
  if (code === 'IMAGE_OFFLOAD_REQUIRED') return false;
  // Effort/tool-capability mismatch is ALWAYS rotate-worthy (another model in
  // the list may support the request shape) — checked before the
  // CONTEXT_WINDOW_EXCEEDED exclusion so provider envelopes that surface it
  // under odd codes still route by wording below.
  if (code === 'CONTEXT_WINDOW_EXCEEDED') return false; // stable code: compaction owns it
  if (MODEL_SIDE_CODES.has(code)) {
    // QUOTA/ACCOUNT_QUOTA and AUTH are always model-side. TRANSPORT/SERVER/etc
    // route by code; UNKNOWN only counts when the wording agrees.
    if (code !== 'UNKNOWN') return true;
  }
  const text = typeof failure.message === 'string' ? failure.message : '';
  return MODEL_SIDE_TEXT.some((re) => re.test(text));
}

function findInOrder(selection) {
  if (selection === null || typeof selection !== 'object') return -1;
  return config.order.findIndex(
    (row) => row.provider === selection.provider && row.model === selection.model,
  );
}


/**
 * Install one model selection through the session-controller's official path
 * (selectForNextRequest): it appends the durable `model/selection` event AND
 * updates the controller's in-memory picked selection.
 *
 * Writing only the durable event (the previous implementation) advanced the
 * projection while the controller's captured `picked` stayed on the FAILED
 * model — so prompt assembly kept reporting the old route, consumeSelection()
 * never matched the new header, and the very next assembly reverted to the
 * failed model. That is exactly the "rotated model doesn't actually work"
 * symptom: it rotated away again immediately.
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
  const controller = ctx.get?.('sessionController');
  const agentsController = controller?.agents;
  if (agentsController !== undefined && typeof agentsController.selectForNextRequest === 'function') {
    agentsController.selectForNextRequest(agent, selection);
    return selection;
  }
  // Fallback (controller absent): durable event only — still better than nothing.
  agent.session.append('model/selection', selection);
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
    // Instruct the loop to re-run the failed step; the loop re-enters
    // prepareRequest(), whose agent/request waterfall re-resolves the route —
    // and the controller's in-memory selection now matches the durable one.
    return { kind: 'retry' };
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
 * Rewrite one proposed request config so its reasoningEffort is compatible
 * with the target model: unsupported effort → adapter default; effort on a
 * non-reasoning model → stripped. This runs in the agent/request waterfall —
 * BEFORE prepareCall validates — so "does not support reasoning effort" never
 * kills the turn. Without this, an effort mismatch thrown in prepareRequest
 * bypasses the agent/request-error waterfall entirely (no retry, no rotation,
 * turn dies) — the reported "本轮运行失败 … does not support reasoning effort
 * 'on'/'high'" symptom.
 */
async function compatEffort(ctx, route) {
  if (route.reasoningEffort === undefined) return route;
  const supported = await supportedEfforts(ctx, route.provider, route.model);
  if (supported === 'unknown') return route;
  if (supported.has(route.reasoningEffort)) return route;
  if (supported.size === 0) {
    // Non-reasoning model: drop the effort entirely.
    const { reasoningEffort: _dropped, ...stripped } = route;
    ctx.logger?.warn?.(
      `[model-rotation] effort "${route.reasoningEffort}" not supported by ${route.provider}/${route.model} (non-reasoning) — stripped`,
    );
    return stripped;
  }
  try {
    const info = await ctx.llm.resolveModelInfo(route.provider, route.model);
    const defaultEffort = info?.reasoning?.defaultEffort;
    if (defaultEffort !== undefined && supported.has(defaultEffort)) {
      ctx.logger?.warn?.(
        `[model-rotation] effort "${route.reasoningEffort}" not supported by ${route.provider}/${route.model} — degraded to adapter default "${defaultEffort}"`,
      );
      return { ...route, reasoningEffort: defaultEffort };
    }
  } catch {
    /* fall through */
  }
  const first = supported.values().next();
  if (!first.done) {
    ctx.logger?.warn?.(
      `[model-rotation] effort "${route.reasoningEffort}" not supported by ${route.provider}/${route.model} — degraded to "${first.value}"`,
    );
    return { ...route, reasoningEffort: first.value };
  }
  return route;
}

/**
 * Pin the newest durable selection onto every request the loop builds. The
 * session-controller's own selection object also feeds assembly, but a retry
 * inside one open turn reuses the step's assembled snapshot; the override here
 * guarantees the rotated route is what actually dispatches. Also normalizes
 * the reasoning effort of whatever route wins (rotated or hand-picked) so
 * effort-incompatible models degrade instead of failing the turn.
 */
function registerRouteOverride(ctx) {
  ctx.on('agent/request', async (payload, next) => {
    const resolved = await next();
    if (!config.enabled) return compatEffort(ctx, resolved);
    const { agent } = payload ?? {};
    if (agent === undefined) return compatEffort(ctx, resolved);
    const state = (() => {
      try {
        return ctx.sessionProjections.stateOf(agent.session, 'modelSelection');
      } catch {
        return undefined;
      }
    })();
    const pending = state?.pending;
    let route = resolved;
    if (pending !== null && pending !== undefined
      && (pending.provider !== resolved.provider || pending.model !== resolved.model)) {
      route = {
        ...resolved,
        provider: pending.provider,
        model: pending.model,
        ...(pending.reasoningEffort === undefined ? {} : { reasoningEffort: pending.reasoningEffort }),
      };
    }
    return compatEffort(ctx, route);
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
  registerRouteOverride(ctx);

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
