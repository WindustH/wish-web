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
import { cfg } from '../config.ts';
import { bus } from '../bus.ts';
import { shallowRef, computed } from 'vue';
import { debounce } from '../util/fmt.ts';
import * as api from '../api/endpoints.ts';
import type { CreateSessionBody, SessionsListParams } from '../api/endpoints.ts';
import type { SessionView } from '../api/projections.ts';
import type { SessionUpsert, SessionTombstone } from './syncSlice.ts';

// One sessions-list row: the list-facing fields of a session snapshot. Rows
// fetched from GET /sessions carry the whole snapshot; locally built ones only these.
export type SessionRow = Pick<SessionView, 'id' | 'name' | 'phase' | 'created_at_ms' | 'updated_at_ms' | 'pending_items' | 'revision' | 'resume_requires_user' | 'metadata'>;
// Opaque server pagination token, bound to the current filter + sort.
export type SessionsCursor = NonNullable<SessionsListParams['cursor']>;
export interface SessionCreateInput { name?: string; provider: string; model: string; reasoningEffort?: string; agentCustom?: string; cwd?: string }
// The metadata-bearing part of a session that updateMeta() needs.
export interface SessionMetaTarget { id: string; revision?: number | null; metadata?: unknown }

// Fields whose change alters a row's position or membership in the current
// collection → authoritative rebuild. Everything else patches in place.
const IDENTITY_FIELDS = new Set(['name', 'updated_at_ms', 'metadata']);
// metadata accessors — the defined keys only; everything else is the
// user's own JSON, carried untouched (decision-json-metadata).
export const metaOf = (row: { metadata?: unknown } | null | undefined): Record<string, unknown> => row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};

export const sessions = (() => {
  const items = shallowRef<SessionRow[]>([]);            // newest first (order=desc)
  const cursor = shallowRef<SessionsCursor | null>(null);
  const hasMore = shallowRef(false);
  const loading = shallowRef(false);
  const loadingMore = shallowRef(false);
  const error = shallowRef<any>(null);
  const query = shallowRef('');
  const phaseFilter = shallowRef('');      // '' = all
  const tagFilter = shallowRef('');        // '' = none; exact tag (contract)

  let gen = 0;                         // request generation

  const list = computed(() => items.value);
  const anyFilterActive = computed(() =>
    Boolean(query.value || phaseFilter.value || tagFilter.value));

  function requestParams() {
    const p: SessionsListParams = {
      limit: cfg.sessions.pageSize, order: 'desc',
      query: query.value || undefined,
      phase: phaseFilter.value || undefined,
    };
    if (tagFilter.value) p.tag = tagFilter.value;
    return p;
  }

  function bump() {
    gen += 1;
    loading.value = false;
    loadingMore.value = false;
  }

  async function loadFirst(): Promise<void> {
    const myGen = ++gen;
    loading.value = true; loadingMore.value = false; error.value = null;
    try {
      const page = await api.sessionsList(requestParams());
      if (myGen !== gen) return;
      items.value = page.items;
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
    } catch (err) {
      if (myGen === gen) error.value = err;
    } finally { if (myGen === gen) loading.value = false; }
  }

  // Authoritative refetch that REPLACES the collection. Preserves how deep
  // the user has navigated by refetching pages up to the current resident
  // count (bounded by rebuildMaxPages), then adopts the server's membership,
  // order and cursor wholesale.
  async function rebuild(): Promise<void> {
    const myGen = ++gen;
    loading.value = true; loadingMore.value = false; error.value = null;
    const keep = Math.max(items.value.length, cfg.sessions.pageSize);
    try {
      let rows: SessionRow[] = [], cur: SessionsCursor | null = null, more = true, pages = 0;
      while (more && rows.length < keep && pages < cfg.sessions.rebuildMaxPages) {
        const page = await api.sessionsList({ ...requestParams(), cursor: cur });
        if (myGen !== gen) return;
        rows = rows.concat(page.items);
        cur = page.next_cursor ?? null;
        more = Boolean(page.has_more);
        pages += 1;
      }
      const seen = new Set<string>(); const uniq: SessionRow[] = [];
      for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); uniq.push(r); }
      items.value = uniq;
      cursor.value = cur;
      hasMore.value = more;
    } catch (err) {
      if (myGen === gen) error.value = err;
    } finally { if (myGen === gen) loading.value = false; }
  }

  async function loadMore(): Promise<boolean> {
    if (loading.value || loadingMore.value || !hasMore.value || cursor.value == null) return false;
    const myGen = gen;
    loadingMore.value = true;
    try {
      const page = await api.sessionsList({ ...requestParams(), cursor: cursor.value });
      if (myGen !== gen) return false;
      const seen = new Set(items.value.map((s) => s.id));
      const merged = [...items.value];
      for (const it of page.items) if (!seen.has(it.id)) { seen.add(it.id); merged.push(it); }
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
  function setQuery(q: string) { if (q === query.value) return; query.value = q; bump(); debouncedSearch(); }
  function setPhaseFilter(p: string) {
    if (p === phaseFilter.value) return;
    phaseFilter.value = p;
    bump();
    loadFirst();
  }

  function setTagFilter(t: string) {
    if (t === tagFilter.value) return;
    tagFilter.value = t;
    bump();
    loadFirst();
  }

  function refresh(): Promise<void> {
    bump();
    return loadFirst();
  }

  async function create({ name, provider, model, reasoningEffort, agentCustom, cwd }: SessionCreateInput): Promise<SessionView> {
    const body: CreateSessionBody = { provider, model };
    if (name) body.name = name;
    if (cwd != null) body.cwd = cwd;
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    if (agentCustom != null && agentCustom !== '') body.agent_custom = agentCustom;
    const snap = await api.sessionCreate(body);
    // The new row's position depends on the active collection (filters,
    // ordering) — the server is the single sorting authority.
    if (anyFilterActive.value) await rebuild();
    else items.value = [snapToListRow(snap), ...items.value.filter((s) => s.id !== snap.id)];
    return snap;
  }

  async function rename(id: string, name: string): Promise<SessionView> {
    const snap = await api.sessionRename(id, name);
    items.value = items.value.map((s) => (s.id === id ? { ...s, name: snap.name } : s));
    return snap;
  }

  // Metadata write (decision-json-metadata): `changes` touches only the
  // defined keys (archived/tags); the rest of the object is carried
  // from the row we read, and the PATCH carries If-Match at that revision.
  // A 409 propagates to the caller (conflict toast + refresh) — no blind
  // retry that would overwrite concurrent extension keys.
  async function updateMeta(row: SessionMetaTarget, changes: Record<string, unknown>): Promise<SessionView> {
    if (!row?.id || row.revision == null) throw new Error('metadata update requires a session snapshot and revision');
    const id = row.id;
    const next = { ...metaOf(row), ...changes };
    const snap = await api.sessionUpdateMeta(id, next, row.revision);
    await rebuild();
    return snap;
  }

  function dropRow(id: string) {
    items.value = items.value.filter((s) => s.id !== id);
  }

  function patchRow(id: string, patch: Partial<SessionRow>): boolean {
    const cur = items.value;
    const idx = cur.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    const next = cur.slice();
    next[idx] = { ...next[idx], ...patch };
    items.value = next;
    return true;
  }

  function getById(id: string): SessionRow | null { return items.value.find((s) => s.id === id) || null; }

  // Live invalidation from the control-plane stream.
  const debouncedRebuild = debounce(() => { rebuild(); }, cfg.sessions.searchDebounceMs * 2);
  bus.on('upsert.session', (u: SessionUpsert) => {
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
      IDENTITY_FIELDS.has(k) || (k === 'phase' && phaseFilter.value));
    if (identityChanged) debouncedRebuild();
    else patchRow(body.id, patch);
  });
  bus.on('tombstone.session', (t: SessionTombstone) => {
    if (t?.id) dropRow(t.id);
  });
  // Authoritative snapshot (reconnect / cursor reset): rebuild the
  // collection — membership, order and cursor are all re-derived.
  bus.on('sync.snapshot', debounce(() => { rebuild(); }, 300));

  return {
    items: list, cursor, hasMore, loading, loadingMore, error,
    query, phaseFilter, tagFilter, anyFilterActive,
    loadFirst, loadMore, rebuild,
    setQuery, setPhaseFilter, setTagFilter, refresh,
    create, rename, updateMeta, dropRow, patchRow, getById,
  };
})();
export type SessionsApi = typeof sessions;

function snapToListRow(snap: SessionView): SessionRow {
  return {
    id: snap.id, name: snap.name, phase: snap.phase,
    created_at_ms: snap.created_at,
    updated_at_ms: snap.updated_at,
    pending_items: snap.queue ?? 0,
    revision: snap.revision, resume_requires_user: snap.resume_requires_user,
    metadata: snap.metadata,
  };
}

function sessionRowFromSync(body: SessionView): Partial<SessionRow> {
  const row: Partial<SessionRow> = {};
  for (const k of ['name', 'phase', 'revision', 'resume_requires_user', 'pending_items'] as const) {
    if (body[k] !== undefined) (row as Record<string, unknown>)[k] = body[k];
  }
  if (body.metadata !== undefined) row.metadata = body.metadata;
  if (body.updated_at) row.updated_at_ms = body.updated_at;
  if (body.updated_at_ms) row.updated_at_ms = body.updated_at_ms;
  if (body.queue !== undefined) row.pending_items = body.queue;
  return row;
}
