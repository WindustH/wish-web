// Typed endpoint surface — the ONLY place URL shapes appear. UI/state call
// these functions, never build URLs themselves. Mirrors
// doc/en/reference/wishd-api.md; shapes verified against openapi.json.
import { get, post, patch, put, del, api, getBaseUrl, providerd } from './client.js';

// ── sessions ────────────────────────────────────────────────────────────
export const sessionsList = (params) => get('/sessions', { query: params });
export const sessionGet = (id, opts) => get(`/sessions/${id}`, opts);
export const sessionCreate = (body) => post('/sessions', body);
export const sessionRename = (id, name) => patch(`/sessions/${id}`, { name });
// Metadata is ONE generic JSON object; PATCH replaces it atomically. The
// caller sends If-Match with the revision it read the object at, so a
// concurrent change surfaces as 409 instead of silently overwriting the
// user's extension keys (decision-json-metadata).
export const sessionUpdateMeta = (id, metadata, ifMatchRevision, opts) =>
  patch(`/sessions/${id}`, { metadata }, {
    ...(opts || {}),
    headers: { ...((opts || {}).headers || {}), ...(ifMatchRevision != null ? { 'if-match': String(ifMatchRevision) } : {}) },
  });
export const sessionDelete = (id, opts) => del(`/sessions/${id}`, opts);
// Provider/model switch: PATCH {provider, model, reasoning_effort?} with the
// revision we read the snapshot at (decision #5). Provider-only switches are
// rejected by the server — the client always sends provider+model together.
export const sessionUpdateModel = (id, body, ifMatchRevision, opts) =>
  patch(`/sessions/${id}`, body, {
    ...(opts || {}),
    headers: { ...((opts || {}).headers || {}), ...(ifMatchRevision != null ? { 'if-match': String(ifMatchRevision) } : {}) },
  });

// ── history (canonical chat timeline) ──────────────────────────────────
export const historyPage = (id, params, opts) => get(`/sessions/${id}/history`, { query: params, ...opts });
// Contract: server-side transcript search (bounded snippets, seq keyset).
export const historySearch = (id, params, opts) => get(`/sessions/${id}/history/search`, { query: params, ...opts });

// ── messages / deliveries / streaming ──────────────────────────────────
export const messageSend = (id, body, opts) =>
  post(`/sessions/${id}/messages`, {
    role: 'user', trigger_agent_loop: true, ...body,
  }, opts);
export const deliveriesList = (id, params, opts) => get(`/sessions/${id}/deliveries`, { query: params, ...opts });
export const deliveryGet = (id, opts) => get(`/deliveries/${id}`, opts);
export const deliveryCancel = (id) => post(`/deliveries/${id}/cancel`);

// ── lifecycle ───────────────────────────────────────────────────────────
export const sessionInterrupt = (id) => post(`/sessions/${id}/interrupt`, {});
export const sessionCompact = (id) => post(`/sessions/${id}/compact`, {});
export const sessionReset = (id, body = {}) => post(`/sessions/${id}/reset`, body);
export const sessionClone = (id) => post(`/sessions/${id}/clone`, {});
export const sessionPrune = (id, body = {}) => post(`/sessions/${id}/prune`, body);
export const compactionHistory = (id) => get(`/sessions/${id}/compaction-history`);

// ── info / stats ────────────────────────────────────────────────────────
export const sessionContext = (id) => get(`/sessions/${id}/context`);
export const sessionContextBudget = (id) => get(`/sessions/${id}/context/budget`);
export const sessionUsage = (id) => get(`/sessions/${id}/metrics/usage`);
export const runGet = (id, opts) => get(`/runs/${id}`, opts);
export const runCancel = (id) => post(`/runs/${id}/cancel`, {});

export const daemonStatus = () => get('/status');
export const daemonVersion = () => get('/version');
export const usageTotals = () => get('/metrics/usage');
export const storageStatus = () => get('/storage/status');

// ── models / providers / config ─────────────────────────────────────────
// ── providerd (separate daemon; catalog reads NEVER go through wishd) ──
export const providerConfigs = (opts) => providerd.get('/provider-configs', opts);
export const providerSummaries = (opts) => providerd.get('/providers', opts);
export const providerModels = (id, opts) => providerd.get(`/providers/${id}/models`, opts);
export const providerdEffective = () => providerd.get('/config/effective');
// Exact contract: {status:'reloaded', config_generation} — no restart list.
export const providerdReload = () => providerd.post('/config/reload', {});
export const configEffective = () => get('/config/effective');
export async function rememberDefaultModel(value) {
  const snapshot = await get('/config/editable');
  const previous = snapshot.config.wishd.default_model;
  if (previous?.provider === value.provider && previous?.model === value.model && previous?.reasoning_effort === value.reasoning_effort) return;
  await patch('/config/editable', { revision: snapshot.revision,
    operations: [{ op: 'add', path: '/wishd/default_model', value }] });
}
export const configReload = () => post('/config/reload', {});
// Contract: streaming read/write surface (strict {enabled} body).
export const streamingGet = (opts) => get('/config/streaming', opts);
export const streamingPut = (enabled, opts) => put('/config/streaming', { enabled }, opts);

// ── blobs / images ──────────────────────────────────────────────────────
export const uploadSessionBlob = (sid, bytes, opts) =>
  api('POST', `/sessions/${sid}/blobs`, {
    body: bytes, raw: true, headers: { 'content-type': 'application/octet-stream' }, ...opts,
  });
export const uploadSessionImage = (sid, bytes, opts) =>
  api('POST', `/sessions/${sid}/blobs/images`, {
    body: bytes, raw: true, headers: { 'content-type': 'application/octet-stream' }, ...opts,
  });
// Contract: per-session model capabilities (same resolution as sending).
export const sessionCapabilities = (id, opts) => get(`/sessions/${id}/capabilities`, opts);

export const blobUrl = (sha256) => `${getBaseUrl()}/blobs/${sha256}`;

// Bounded server-side usage projections; no transcript/attempt scans in UI.
export const usageSeries = (sessionId, params, opts) =>
  get(sessionId ? `/sessions/${sessionId}/metrics/usage/series` : '/metrics/usage/series', { query: params, ...opts });
export const usageDaily = (sessionId, params, opts) =>
  get(sessionId ? `/sessions/${sessionId}/metrics/usage/daily` : '/metrics/usage/daily', { query: params, ...opts });
