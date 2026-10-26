import { ref } from 'vue';
const ENABLED_KEY = 'debug.activity.enabled';
// Separate browser tabs must not overwrite each other's traces. Session storage survives reload.
function tabId() {
  try {
    const previous = sessionStorage.getItem('debug.activity.tab');
    if (previous) return previous;
    const id = Math.random().toString(36).slice(2);
    sessionStorage.setItem('debug.activity.tab', id); return id;
  } catch { return Math.random().toString(36).slice(2); }
}
const tab = tabId();
const RECORDS_KEY = `debug.activity.records.${tab}`;
export const ACTIVITY_LIMIT = 2000;
export interface ActivityRecord { at: string; build: string; tab: string; kind: string; route: string; detail: Record<string, unknown> }
function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function restore(): ActivityRecord[] {
  try { const rows = JSON.parse(sessionStorage.getItem(RECORDS_KEY) ?? '[]'); return Array.isArray(rows) ? rows.slice(-ACTIVITY_LIMIT) : []; } catch { return []; }
}
let records = restore();
export const activityEnabled = ref(read(ENABLED_KEY) === '1');
export const activityCount = ref(records.length);
export const activityStorageFailed = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
export function flushActivity() {
  clearTimeout(timer); timer = undefined;
  try { sessionStorage.setItem(RECORDS_KEY, JSON.stringify(records)); activityStorageFailed.value = false; }
  catch { activityStorageFailed.value = true; }
}
export function recordActivity(kind: string, detail: Record<string, unknown> = {}) {
  if (!activityEnabled.value) return;
  records.push({ at: new Date().toISOString(), build: typeof __WEB_BUILD_ID__ === 'string' ? __WEB_BUILD_ID__ : 'development', tab,
    kind, route: location.hash.split('?')[0] || location.pathname, detail });
  if (records.length > ACTIVITY_LIMIT) records.splice(0, records.length - ACTIVITY_LIMIT);
  activityCount.value = records.length;
  timer ??= setTimeout(flushActivity, 500);
}
export function setActivityEnabled(enabled: boolean) {
  if (!enabled) recordActivity('recording.disabled');
  activityEnabled.value = enabled;
  try { localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0'); } catch { activityStorageFailed.value = true; }
  flushActivity();
}
export function clearActivity() { records = []; activityCount.value = 0; flushActivity(); }
export function exportActivity() { flushActivity(); return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), limit: ACTIVITY_LIMIT, records }, null, 2); }
