// Sessions list slice: paginated, searchable, patched live by the sync
// stream. Authoritative list data comes from GET /sessions; sync frames
// only patch rows in place (per ui-integration: SSE is an invalidation
// signal, not a data source for lists).
//
// Correctness (task 4):
//  · request GENERATIONS — every fetch captures the generation and stale
//    responses are discarded, so an old query/filter page can never
//    overwrite a newer one;
//  · cursor is bound to the current filter+sort: any filter change drops
//    the cursor and reloads (contract: cursor must not leak across
//    filtered collections);
//  · resident cap is honest: reaching maxListItems stops loading and says
//    so — it never advances the cursor while silently hiding rows (the
//    audit bug: >600 rows were fetched, sliced away, never visible).
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { signal, derive } from './reactive.js';
import { debounce } from '../util/fmt.js';
import * as api from '../api/endpoints.js';

export const sessions = (() => {
  const items = signal([]);            // ascending-load, newest first (order=desc)
  const cursor = signal(null);
  const hasMore = signal(false);
  const residentCapped = signal(false); // true = hit data cap, refine search
  const loading = signal(false);
  const loadingMore = signal(false);
  const error = signal(null);
  const query = signal('');
  const phaseFilter = signal('');      // '' = all
  const archivedFilter = signal('');   // '' = all | 'true' | 'false' (contract)
  const tagFilter = signal('');        // '' = none; exact tag (contract)
  const pinnedFirst = signal(false);   // contract: default keeps old ordering
  const totalKnown = signal(null);     // from count_kind exact

  let gen = 0;                         // request generation

  const list = derive(() => items.value);
  const anyFilterActive = derive(() =>
    Boolean(query.value || phaseFilter.value || archivedFilter.value || tagFilter.value));

  function requestParams() {
    const p = {
      limit: cfg.sessions.pageSize, order: 'desc',
      query: query.peek() || undefined,
      phase: phaseFilter.peek() || undefined,
    };
    if (archivedFilter.peek()) p.archived = archivedFilter.peek();
    if (tagFilter.peek()) p.tag = tagFilter.peek();
    if (pinnedFirst.peek()) p.pinned_first = true;
    return p;
  }

  function clear() {
    items.value = []; cursor.value = null; hasMore.value = false;
    error.value = null; totalKnown.value = null; residentCapped.value = false;
  }

  async function loadFirst() {
    const myGen = ++gen;
    loading.value = true; error.value = null;
    try {
      const page = await api.sessionsList(requestParams());
      if (myGen !== gen) return;
      items.value = page.items ?? [];
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
      residentCapped.value = false;
      totalKnown.value = page.count_kind === 'exact' ? (page.count ?? page.items?.length) : null;
    } catch (err) {
      if (myGen === gen) error.value = err;
    } finally { if (myGen === gen) loading.value = false; }
  }

  async function loadMore() {
    if (loadingMore.peek() || !hasMore.peek() || cursor.peek() == null) return false;
    if (items.peek().length >= cfg.sessions.maxListItems) {
      // Honest stop: resident data is at its cap. Say so; never advance the
      // cursor while dropping the rows it just fetched.
      residentCapped.value = true;
      return false;
    }
    const myGen = gen;
    loadingMore.value = true;
    try {
      const page = await api.sessionsList({
        ...requestParams(), cursor: cursor.peek(),
      });
      if (myGen !== gen) return false;
      const seen = new Set(items.peek().map((s) => s.id));
      const merged = [...items.peek()];
      for (const it of page.items ?? []) if (!seen.has(it.id)) merged.push(it);
      items.value = merged.slice(0, cfg.sessions.maxListItems);
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
      return true;
    } catch (err) {
      if (myGen === gen) error.value = err;
      return false;
    } finally { if (myGen === gen) loadingMore.value = false; }
  }

  const debouncedSearch = debounce(() => { clear(); loadFirst(); }, cfg.sessions.searchDebounceMs);
  function setQuery(q) { if (q === query.peek()) return; query.value = q; debouncedSearch(); }
  function setPhaseFilter(p) { if (p === phaseFilter.peek()) return; phaseFilter.value = p; clear(); loadFirst(); }
  function setArchivedFilter(v) { if (v === archivedFilter.peek()) return; archivedFilter.value = v; clear(); loadFirst(); }
  function setTagFilter(t) { if (t === tagFilter.peek()) return; tagFilter.value = t; clear(); loadFirst(); }
  function setPinnedFirst(v) { if (v === pinnedFirst.peek()) return; pinnedFirst.value = v; clear(); loadFirst(); }
  function refresh() { clear(); return loadFirst(); }

  // Background re-sync of page 1: patches rows / prepends new sessions
  // WITHOUT the loading state (no list blink). Generation-guarded so a
  // silent refresh cannot race a user-driven filter change.
  async function silentRefresh() {
    const myGen = gen;
    try {
      const page = await api.sessionsList(requestParams());
      if (myGen !== gen || page.items == null) return;
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
    // Filters decide whether the new session belongs in this view; when any
    // is active, reload instead of blindly prepending.
    if (anyFilterActive.value) {
      await loadFirst();
    } else {
      const cur = items.peek().filter((s) => s.id !== snap.id);
      items.value = [snapToListRow(snap), ...cur];
    }
    return snap;
  }

  async function rename(id, name) {
    const snap = await api.sessionRename(id, name);
    items.value = items.peek().map((s) => (s.id === id ? { ...s, name: snap.name } : s));
    return snap;
  }

  // Contract metadata write: pinned / archived / tags via session PATCH.
  async function updateMeta(id, patch) {
    const snap = await api.sessionUpdateMeta(id, patch);
    const row = snapToListRow(snap);
    // The row may no longer match the active filter (e.g. archived while
    // viewing non-archived): drop it from view; sync will confirm.
    const keep = rowMatchesFilter(row);
    items.value = keep
      ? items.peek().map((s) => (s.id === id ? { ...s, ...row } : s))
      : items.peek().filter((s) => s.id !== id);
    return snap;
  }

  function rowMatchesFilter(row) {
    if (archivedFilter.peek() === 'true' && !row.archived) return false;
    if (archivedFilter.peek() === 'false' && row.archived) return false;
    if (tagFilter.peek() && !(row.tags ?? []).includes(tagFilter.peek())) return false;
    if (phaseFilter.peek() && row.phase !== phaseFilter.peek()) return false;
    return true;
  }

  function dropRow(id) {
    items.value = items.peek().filter((s) => s.id !== id);
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
      if (!query.peek() && !phaseFilter.peek() && !tagFilter.peek() && !archivedFilter.peek() && !loading.peek()) debouncedSilent();
    }
  });
  bus.on('tombstone.session', (t) => {
    if (!t?.id) return;
    items.value = items.peek().filter((s) => s.id !== t.id);
  });
  // Authoritative snapshot (reconnect / reset): rebuild the current view.
  bus.on('sync.snapshot', debounce(() => { if (!loading.peek()) silentRefresh(); }, 300));
  bus.on('sync.runtime', () => { /* storageStates applied in sync slice */ });

  return {
    items: list, cursor, hasMore, residentCapped, loading, loadingMore, error,
    query, phaseFilter, archivedFilter, tagFilter, pinnedFirst, totalKnown, anyFilterActive,
    loadFirst, loadMore, setQuery, setPhaseFilter, setArchivedFilter, setTagFilter,
    setPinnedFirst, refresh, create, rename, updateMeta, dropRow, patchRow,
    getById, silentRefresh,
  };
})();

function snapToListRow(snap) {
  return {
    id: snap.id, name: snap.name, phase: snap.phase,
    created_at_ms: Date.parse(snap.created_at) || null,
    updated_at_ms: Date.parse(snap.updated_at) || null,
    pending_items: snap.queue ?? 0, storage_state: snap.storage_state ?? 'hot',
    revision: snap.revision, resume_requires_user: snap.resume_requires_user,
    pinned: Boolean(snap.pinned), archived: Boolean(snap.archived),
    tags: Array.isArray(snap.tags) ? snap.tags : [],
  };
}

function sessionRowFromSync(body) {
  const row = {};
  for (const k of ['name', 'phase', 'storage_state', 'revision', 'resume_requires_user', 'pending_items', 'pinned', 'archived']) {
    if (body[k] !== undefined) row[k] = body[k];
  }
  if (body.tags !== undefined) row.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.updated_at) row.updated_at_ms = Date.parse(body.updated_at) || null;
  if (body.updated_at_ms) row.updated_at_ms = body.updated_at_ms;
  if (body.queue !== undefined) row.pending_items = body.queue;
  return row;
}
