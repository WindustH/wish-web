// Sessions list slice: paginated, searchable, live-invalidated by the sync
// stream. Authoritative data always comes from GET /sessions; sync frames
// are invalidation signals, never a data source for lists.
//
// Lifecycle (one implementation, review round-2):
//  · bump() is the SINGLE invalidation point: it flips the request
//    generation and resets every loading flag, so a stale in-flight
//    response (old query, old filter, pre-reset) can neither write back
//    nor wedge `loadingMore` for the next view. Collection identity
//    changes (query/filter/sort) invalidate IMMEDIATELY; network debounce
//    only delays the fetch, never the invalidation.
//  · The cursor is an opaque server token bound to the current
//    filter+sort (contract): any identity change reloads from page one.
//  · Full navigability: loadMore() appends without a resident cap — DOM
//    size is bounded by the chunked Vlist, data is never unreachable.
//  · rebuild() is the AUTHORITATIVE path (sync.snapshot resets, upserts
//    that change sort/filter identity, metadata writes): it refetches up
//    to the current navigation depth and REPLACES membership, order and
//    cursor. It never merges — rows deleted while disconnected disappear.
//  · Errors are surfaced (signal `error`), never swallowed into an empty
//    or partial "success" list.
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { signal, derive } from './reactive.js';
import { debounce } from '../util/fmt.js';
import * as api from '../api/endpoints.js';

// Fields whose change alters a row's position or membership in the current
// collection → authoritative rebuild. Everything else patches in place.
const IDENTITY_FIELDS = new Set(['name', 'updated_at_ms', 'metadata']);
// metadata accessors — the defined keys only; everything else is the
// user's own JSON, carried untouched (decision-json-metadata).
export const metaOf = (row) => row == null ? {} : row.metadata;
export const metaBool = (row, key) => metaOf(row)[key] === true;
export const metaTags = (row) => metaOf(row).tags ?? [];

export const sessions = (() => {
  const items = signal([]);            // newest first (order=desc)
  const cursor = signal(null);
  const hasMore = signal(false);
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

  function bump() {
    gen += 1;
    loading.value = false;
    loadingMore.value = false;
  }

  async function loadFirst() {
    const myGen = ++gen;
    loading.value = true; loadingMore.value = false; error.value = null;
    try {
      const page = await api.sessionsList(requestParams());
      if (myGen !== gen) return;
      items.value = page.items;
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
      totalKnown.value = page.count_kind === 'exact' ? page.count : null;
    } catch (err) {
      if (myGen === gen) error.value = err;
    } finally { if (myGen === gen) loading.value = false; }
  }

  // Authoritative refetch that REPLACES the collection. Preserves how deep
  // the user has navigated by refetching pages up to the current resident
  // count (bounded by rebuildMaxPages), then adopts the server's membership,
  // order and cursor wholesale.
  async function rebuild() {
    const myGen = ++gen;
    loading.value = true; loadingMore.value = false; error.value = null;
    const keep = Math.max(items.peek().length, cfg.sessions.pageSize);
    try {
      let rows = [], cur = null, more = true, pages = 0;
      while (more && rows.length < keep && pages < cfg.sessions.rebuildMaxPages) {
        const page = await api.sessionsList({ ...requestParams(), cursor: cur });
        if (myGen !== gen) return;
        rows = rows.concat(page.items);
        cur = page.next_cursor ?? null;
        more = Boolean(page.has_more);
        pages += 1;
      }
      const seen = new Set(); const uniq = [];
      for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); uniq.push(r); }
      items.value = uniq;
      cursor.value = cur;
      hasMore.value = more;
      totalKnown.value = null;
    } catch (err) {
      if (myGen === gen) error.value = err;
    } finally { if (myGen === gen) loading.value = false; }
  }

  async function loadMore() {
    if (loadingMore.peek() || !hasMore.peek() || cursor.peek() == null) return false;
    const myGen = gen;
    loadingMore.value = true;
    try {
      const page = await api.sessionsList({ ...requestParams(), cursor: cursor.peek() });
      if (myGen !== gen) return false;
      const seen = new Set(items.peek().map((s) => s.id));
      const merged = [...items.peek()];
      for (const it of page.items) if (!seen.has(it.id)) merged.push(it);
      items.value = merged;
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
      return true;
    } catch (err) {
      if (myGen === gen) error.value = err;
      return false;
    } finally { if (myGen === gen) loadingMore.value = false; }
  }

  const debouncedSearch = debounce(() => { loadFirst(); }, cfg.sessions.searchDebounceMs);
  function setQuery(q) { if (q === query.peek()) return; query.value = q; bump(); debouncedSearch(); }
  function setPhaseFilter(p) { if (p === phaseFilter.peek()) return; phaseFilter.value = p; bump(); loadFirst(); }
  function setArchivedFilter(v) { if (v === archivedFilter.peek()) return; archivedFilter.value = v; bump(); loadFirst(); }
  function setTagFilter(t) { if (t === tagFilter.peek()) return; tagFilter.value = t; bump(); loadFirst(); }
  function setPinnedFirst(v) { if (v === pinnedFirst.peek()) return; pinnedFirst.value = v; bump(); loadFirst(); }
  function refresh() { bump(); return loadFirst(); }

  async function create({ name, provider, model, reasoningEffort, agentCustom }) {
    const body = { provider, model };
    if (name) body.name = name;
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    if (agentCustom != null && agentCustom !== '') body.agent_custom = agentCustom;
    const snap = await api.sessionCreate(body);
    // The new row's position depends on the active collection (filters,
    // pinned_first ordering) — the server is the single sorting authority.
    if (anyFilterActive.value || pinnedFirst.value) await rebuild();
    else items.value = [snapToListRow(snap), ...items.peek().filter((s) => s.id !== snap.id)];
    return snap;
  }

  async function rename(id, name) {
    const snap = await api.sessionRename(id, name);
    items.value = items.peek().map((s) => (s.id === id ? { ...s, name: snap.name } : s));
    return snap;
  }

  // Metadata write (decision-json-metadata): `changes` touches only the
  // defined keys (pinned/archived/tags); the rest of the object is carried
  // from the row we read, and the PATCH carries If-Match at that revision.
  // A 409 propagates to the caller (conflict toast + refresh) — no blind
  // retry that would overwrite concurrent extension keys.
  async function updateMeta(row, changes) {
    if (!row?.id || row.revision == null) throw new Error('metadata update requires a session snapshot and revision');
    const id = row.id;
    const next = { ...metaOf(row), ...changes };
    const snap = await api.sessionUpdateMeta(id, next, row.revision);
    await rebuild();
    return snap;
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

  // Live invalidation from the control-plane stream.
  const debouncedRebuild = debounce(() => { rebuild(); }, cfg.sessions.searchDebounceMs * 2);
  bus.on('upsert.session', (u) => {
    const body = u.body ?? u;
    if (!body?.id) return;
    const patch = sessionRowFromSync(body);
    const cur = getById(body.id);
    if (!cur) {
      // A session outside the resident set changed: it may need to enter
      // this collection (new session, or now matches the filters).
      debouncedRebuild();
      return;
    }
    const identityChanged = Object.keys(patch).some((k) =>
      IDENTITY_FIELDS.has(k) || (k === 'phase' && phaseFilter.peek()));
    if (identityChanged) debouncedRebuild();
    else patchRow(body.id, patch);
  });
  bus.on('tombstone.session', (t) => {
    if (t?.id) dropRow(t.id);
  });
  // Authoritative snapshot (reconnect / cursor reset): rebuild the
  // collection — membership, order and cursor are all re-derived.
  bus.on('sync.snapshot', debounce(() => { rebuild(); }, 300));

  return {
    items: list, cursor, hasMore, loading, loadingMore, error,
    query, phaseFilter, archivedFilter, tagFilter, pinnedFirst, totalKnown, anyFilterActive,
    loadFirst, loadMore, rebuild, setQuery, setPhaseFilter, setArchivedFilter, setTagFilter,
    setPinnedFirst, refresh, create, rename, updateMeta, dropRow, patchRow, getById,
  };
})();

function snapToListRow(snap) {
  return {
    id: snap.id, name: snap.name, phase: snap.phase,
    created_at_ms: Date.parse(snap.created_at) || null,
    updated_at_ms: Date.parse(snap.updated_at) || null,
    pending_items: snap.queue ?? 0,
    revision: snap.revision, resume_requires_user: snap.resume_requires_user,
    metadata: snap.metadata,
  };
}

function sessionRowFromSync(body) {
  const row = {};
  for (const k of ['name', 'phase', 'revision', 'resume_requires_user', 'pending_items']) {
    if (body[k] !== undefined) row[k] = body[k];
  }
  if (body.metadata !== undefined) row.metadata = body.metadata;
  if (body.updated_at) row.updated_at_ms = Date.parse(body.updated_at) || null;
  if (body.updated_at_ms) row.updated_at_ms = body.updated_at_ms;
  if (body.queue !== undefined) row.pending_items = body.queue;
  return row;
}
