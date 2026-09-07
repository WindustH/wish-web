// Typed endpoint surface — the ONLY place URL shapes appear. UI/state call
// these functions, never build URLs themselves. Mirrors
// doc/en/reference/wishd-api.md; shapes verified against openapi.json.
import { get, post, patch, api, getBaseUrl } from './client.js';

// ── sessions ────────────────────────────────────────────────────────────
export const sessionsList = (params) => get('/sessions', { query: params });
export const sessionGet = (id) => get(`/sessions/${id}`);
export const sessionCreate = (body) => post('/sessions', body);
export const sessionRename = (id, name) => patch(`/sessions/${id}`, { name });

// ── history (canonical chat timeline) ──────────────────────────────────
export const historyPage = (id, params) => get(`/sessions/${id}/history`, { query: params });

// ── messages / deliveries / streaming ──────────────────────────────────
export const messageSend = (id, body) =>
  post(`/sessions/${id}/messages`, {
    role: 'user', trigger_agent_loop: true, ...body,
  });
export const deliveriesList = (id, params) => get(`/sessions/${id}/deliveries`, { query: params });
export const deliveryGet = (id) => get(`/deliveries/${id}`);
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
export const sessionRuns = (id, params) => get(`/sessions/${id}/runs`, { query: params });
export const runGet = (id) => get(`/runs/${id}`);
export const runCancel = (id) => post(`/runs/${id}/cancel`, {});

export const daemonStatus = () => get('/status');
export const daemonVersion = () => get('/version');
export const usageTotals = () => get('/metrics/usage');
export const storageStatus = () => get('/storage/status');

// ── models / providers / config ─────────────────────────────────────────
export const providerConfigs = () => get('/provider/configs');
export const providerModels = (id) => get(`/providers/${id}/models`);
export const configEffective = () => get('/config/effective');
export const configReload = () => post('/config/reload', {});

// ── blobs / images ──────────────────────────────────────────────────────
export const uploadSessionImage = (sid, bytes, mime) =>
  api('POST', `/sessions/${sid}/blobs/images`, {
    body: bytes, raw: true, headers: { 'content-type': mime },
  });
export const blobUrl = (sha256) => `${getBaseUrl()}/blobs/${sha256}`;
