// Sessions list slice: paginated, searchable, patched live by the sync
// stream. Authoritative list data comes from GET /sessions; sync frames
// only patch rows in place (per ui-integration: SSE is an invalidation
// signal, not a data source for lists).
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { signal, derive } from './reactive.js';
import { debounce } from '../util/fmt.js';
import * as api from '../api/endpoints.js';

export const sessions = (() => {
  const items = signal([]);            // ascending-load, newest first (order=desc)
  const cursor = signal(null);
  const hasMore = signal(false);
  const loading = signal(false);
  const loadingMore = signal(false);
  const error = signal(null);
  const query = signal('');
  const phaseFilter = signal('');      // '' = all
  const totalKnown = signal(null);     // from count_kind exact

  const list = derive(() => items.value);

  function clear() {
    items.value = []; cursor.value = null; hasMore.value = false;
    error.value = null; totalKnown.value = null;
  }

  async function loadFirst() {
    loading.value = true; error.value = null;
    try {
      const page = await api.sessionsList({
        limit: cfg.sessions.pageSize, order: 'desc',
        query: query.peek() || undefined,
        phase: phaseFilter.peek() || undefined,
      });
      items.value = page.items ?? [];
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
      totalKnown.value = page.count_kind === 'exact' ? (page.count ?? page.items?.length) : null;
    } catch (err) {
      error.value = err;
    } finally { loading.value = false; }
  }

  async function loadMore() {
    if (loadingMore.peek() || !hasMore.peek() || cursor.peek() == null) return;
    loadingMore.value = true;
    try {
      const page = await api.sessionsList({
        limit: cfg.sessions.pageSize, order: 'desc', cursor: cursor.peek(),
        query: query.peek() || undefined,
        phase: phaseFilter.peek() || undefined,
      });
      const seen = new Set(items.peek().map((s) => s.id));
      const merged = [...items.peek()];
      for (const it of page.items ?? []) if (!seen.has(it.id)) merged.push(it);
      // Hard resident cap: sessions browser stays light over thousands of
      // archived (cold) sessions; "load more" always refetches if truncated.
      items.value = merged.slice(0, cfg.sessions.maxListItems);
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
    } catch (err) {
      error.value = err;
    } finally { loadingMore.value = false; }
  }

  const debouncedSearch = debounce(() => { clear(); loadFirst(); }, cfg.sessions.searchDebounceMs);
  function setQuery(q) { query.value = q; debouncedSearch(); }
  function setPhaseFilter(p) { phaseFilter.value = p; clear(); loadFirst(); }
  function refresh() { clear(); return loadFirst(); }

  // Background re-sync of page 1: patches rows / prepends new sessions
  // WITHOUT the loading state (no list blink — flicker root cause was the
  // loading spinner swap triggered by every unknown-row upsert).
  async function silentRefresh() {
    try {
      const page = await api.sessionsList({
        limit: cfg.sessions.pageSize, order: 'desc',
        query: query.peek() || undefined,
        phase: phaseFilter.peek() || undefined,
      });
      if (page.items == null) return;
      const byId = new Map(items.peek().map((s) => [s.id, s]));
      let next = items.peek().slice();
      let touched = false;
      for (const row of page.items) {
        const cur = byId.get(row.id);
        if (!cur) { next.unshift(row); touched = true; }
        else if (JSON.stringify(cur) !== JSON.stringify(row)) {
          next = next.map((s) => (s.id === row.id ? row : s));
          touched = true;
        }
      }
      if (touched) items.value = next.slice(0, cfg.sessions.maxListItems);
    } catch { /* transient */ }
  }

  async function create({ name, provider, model, reasoningEffort, agentCustom }) {
    const body = { provider, model };
    if (name) body.name = name;
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    if (agentCustom != null && agentCustom !== '') body.agent_custom = agentCustom;
    const snap = await api.sessionCreate(body);
    // Put the new session on top immediately; sync will confirm.
    const cur = items.peek().filter((s) => s.id !== snap.id);
    items.value = [snapToListRow(snap), ...cur];
    return snap;
  }

  async function rename(id, name) {
    const snap = await api.sessionRename(id, name);
    items.value = items.peek().map((s) => (s.id === id ? { ...s, name: snap.name } : s));
    return snap;
  }

  function patchRow(id, patch) {
    const cur = items.peek();
    const idx = cur.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    const next = cur.slice();
    next[idx] = { ...next[idx], ...patch };
    items.value = next;
    return true;
  }

  function getById(id) { return items.peek().find((s) => s.id === id) || null; }

  // Live patching from the control-plane stream.
  const debouncedSilent = debounce(() => silentRefresh(), cfg.sessions.searchDebounceMs * 2);
  bus.on('upsert.session', (u) => {
    const body = u.body ?? u;
    if (!body?.id) return;
    if (!patchRow(body.id, sessionRowFromSync(body))) {
      // A session not in the resident list changed: resync page 1 quietly
      // (only when not searching, to keep search results stable).
      if (!query.peek() && !phaseFilter.peek() && !loading.peek()) debouncedSilent();
    }
  });
  bus.on('tombstone.session', (t) => {
    if (!t?.id) return;
    items.value = items.peek().filter((s) => s.id !== t.id);
  });
  bus.on('sync.runtime', () => { /* storageStates applied in sync slice */ });

  return {
    items: list, cursor, hasMore, loading, loadingMore, error, query, phaseFilter,
    totalKnown, loadFirst, loadMore, setQuery, setPhaseFilter, refresh,
    create, rename, patchRow, getById, silentRefresh,
  };
})();

function snapToListRow(snap) {
  return {
    id: snap.id, name: snap.name, phase: snap.phase,
    created_at_ms: Date.parse(snap.created_at) || null,
    updated_at_ms: Date.parse(snap.updated_at) || null,
    pending_items: snap.queue ?? 0, storage_state: snap.storage_state ?? 'hot',
    revision: snap.revision, resume_requires_user: snap.resume_requires_user,
  };
}

function sessionRowFromSync(body) {
  const row = {};
  for (const k of ['name', 'phase', 'storage_state', 'revision', 'resume_requires_user', 'pending_items']) {
    if (body[k] !== undefined) row[k] = body[k];
  }
  if (body.updated_at) row.updated_at_ms = Date.parse(body.updated_at) || null;
  if (body.updated_at_ms) row.updated_at_ms = body.updated_at_ms;
  if (body.queue !== undefined) row.pending_items = body.queue;
  return row;
}
