// The list a user browses - folders and sessions - one folder at a time, the way a file
// manager shows a directory: opening a folder replaces the list with what it holds, and the path
// to it leads back up. Looking for words or a tag lists every match, flat, wherever it is.
// Authoritative data always comes from GET /conversations; sync frames are invalidation signals,
// never a data source for lists.
//
// Lifecycle (one implementation, review round-2):
//  · bump() is the SINGLE invalidation point: it flips the request
//    generation and resets every loading flag, so a stale in-flight
//    response (old folder, old query, old filter, pre-reset) can neither
//    write back nor wedge `loadingMore` for the next view. Collection
//    identity changes (folder/query/filter) invalidate IMMEDIATELY;
//    network debounce only delays the fetch, never the invalidation.
//  · The cursor is an opaque server token bound to the current
//    folder+filter+sort (contract): any identity change reloads from page one.
//  · Full navigability: loadMore() appends without a resident cap — DOM
//    size is bounded by the chunked Vlist, data is never unreachable.
//  · rebuild() is the AUTHORITATIVE path (sync.snapshot resets, upserts,
//    moves, metadata writes): it refetches up to the current navigation
//    depth and REPLACES membership, order and cursor. It never merges —
//    rows deleted while disconnected disappear.
//  · Errors are surfaced (signal `error`), never swallowed into an empty
//    or partial "success" list.
import { getConnectionScope } from '../api/client.ts';
import { cfg } from '../config.ts';
import { bus } from '../bus.ts';
import { shallowRef, computed } from 'vue';
import { debounce } from '../util/fmt.ts';
import * as api from '../api/endpoints.ts';
import type { CreateSessionBody, FolderView, Placement, SessionsListParams } from '../api/endpoints.ts';
import type { SessionView } from '../api/projections.ts';
import type { SessionUpsert, SessionTombstone } from './syncSlice.ts';
import { platform } from '../../platform/index.ts';
import { createOptimisticRows } from './optimisticRows.ts';
import { requestId } from '../util/requestId.ts';

// One list row: the list-facing fields of a session snapshot or a folder, with where it
// is. Rows fetched from GET /conversations carry the whole snapshot.
export type SessionRow = { kind: 'session' } & Placement &
  Pick<SessionView, 'id' | 'name' | 'phase' | 'updated_at' | 'revision' | 'metadata'>;
export type FolderRow = { kind: 'folder'; pending?: boolean } & FolderView;
export type ListRow = SessionRow | FolderRow;
// Opaque server pagination token, bound to the current folder, filter and sort.
type SessionsCursor = NonNullable<SessionsListParams['cursor']>;
export interface SessionCreateInput {
  name?: string;
  provider: string;
  model: string;
  reasoningEffort?: string;
  agentCustom?: string;
  cwd?: string;
  folder?: string | null;
}
// The metadata-bearing part of a session that updateMeta() needs.
export interface SessionMetaTarget {
  id: string;
  revision?: number | null;
  metadata?: unknown;
}

// Where the list was, kept for the next visit.
const folderKey = () =>
  getConnectionScope() === cfg.api.baseUrl ? 'list.folder' : 'list.folder.' + getConnectionScope();

// metadata accessors — the defined keys only; everything else is the
// user's own JSON, carried untouched (decision-json-metadata).
const metaOf = (row: { metadata?: unknown } | null | undefined): Record<string, unknown> =>
  row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? (row.metadata as Record<string, unknown>)
    : {};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const folderNameKey = (name: string) => name.replace(/[A-Z]/g, (c) => c.toLowerCase());
function placementOrder(a: ListRow, b: ListRow) {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  return (
    Number(b.pinned) - Number(a.pinned) ||
    (a.kind === 'folder' && b.kind === 'folder'
      ? compareText(folderNameKey(a.name), folderNameKey(b.name))
      : a.kind === 'session' && b.kind === 'session'
        ? b.updated_at - a.updated_at
        : 0) ||
    compareText(a.id, b.id)
  );
}

// The rows in order, each id once: pages fetched while the list moves can overlap.
function uniqueById(rows: ListRow[]): ListRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.id) && seen.add(row.id));
}

/** What an entry is called in lists: its name, or the start of its id. */
export const sessionTitle = (row: { id: string; name?: string | null }) => row.name || row.id.slice(0, 8);

export const sessions = (() => {
  const items = shallowRef<ListRow[]>([]);
  const cursor = shallowRef<SessionsCursor | null>(null);
  const hasMore = shallowRef(false);
  const loading = shallowRef(false);
  const loadingMore = shallowRef(false);
  const error = shallowRef<any>(null);
  const query = shallowRef('');
  const tagFilter = shallowRef(''); // '' = none; exact tag (contract)
  // The folder shown (null for the root), and every folder, for the path to it and its names.
  const folder = shallowRef<string | null>(null);
  let hydrated = false;
  function hydrate() {
    if (hydrated) return;
    folder.value = readFolder();
    hydrated = true;
  }
  const folders = shallowRef(new Map<string, FolderView>());
  const edits = createOptimisticRows<ListRow>();
  const removing = shallowRef(new Set<string>());
  const pendingFolders = shallowRef<FolderRow[]>([]);

  let gen = 0; // request generation

  const filtered = computed(() => Boolean(query.value || tagFilter.value));
  const list = computed(() => {
    const authoritative = items.value.filter((row) => !removing.value.has(row.id));
    const projected = authoritative.map(edits.project);
    if (tagFilter.value)
      return projected.filter((row, index) => {
        if (row === authoritative[index]) return true;
        const tags = row.kind === 'session' ? metaOf(row).tags : undefined;
        return tags === undefined || (Array.isArray(tags) && tags.includes(tagFilter.value));
      });
    if (filtered.value) return projected;
    const creating = pendingFolders.value.filter((row) => row.parent === folder.value);
    return creating.length || projected.some((row, index) => row !== authoritative[index])
      ? [...projected, ...creating].sort(placementOrder)
      : projected;
  });
  function patchRow(id: string, project: (row: ListRow) => ListRow, reorder = false) {
    const updated = items.value.map((row) => (row.id === id ? project(row) : row));
    items.value = reorder && !filtered.value ? updated.sort(placementOrder) : updated;
  }
  /** The folders from the root down to the one shown. */
  const path = computed<FolderView[]>(() => {
    const out: FolderView[] = [];
    for (let id = folder.value; id && folders.value.has(id) && out.length < 64; id = folders.value.get(id)!.parent) {
      out.unshift(folders.value.get(id)!);
    }
    return out;
  });

  function requestParams() {
    const p: SessionsListParams & { folder?: string } = {
      limit: cfg.sessions.pageSize,
      order: 'desc',
      query: query.value || undefined,
    };
    if (tagFilter.value) p.tag = tagFilter.value;
    if (folder.value && !filtered.value) p.folder = folder.value;
    return p;
  }

  let listController = new AbortController();
  function bump() {
    listController.abort();
    listController = new AbortController();
    gen += 1;
    loading.value = false;
    loadingMore.value = false;
  }

  async function loadFirst(): Promise<void> {
    bump();
    const myGen = gen;
    loading.value = true;
    loadingMore.value = false;
    error.value = null;
    void loadFolders();
    try {
      const page = await api.conversationsList(requestParams(), { signal: listController.signal });
      if (myGen !== gen) return;
      items.value = page.items as ListRow[];
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
    } catch (err) {
      if (myGen === gen) error.value = err;
    } finally {
      if (myGen === gen) loading.value = false;
    }
  }

  // Authoritative refetch that REPLACES the collection. Preserves how deep
  // the user has navigated by refetching pages up to the current resident
  // count (bounded by rebuildMaxPages), then adopts the server's membership,
  // order and cursor wholesale.
  async function rebuild(): Promise<void> {
    bump();
    const myGen = gen;
    loading.value = true;
    loadingMore.value = false;
    error.value = null;
    void loadFolders();
    const keep = Math.max(items.value.length, cfg.sessions.pageSize);
    try {
      let rows: ListRow[] = [],
        cur: SessionsCursor | null = null,
        more = true,
        pages = 0;
      while (more && rows.length < keep && pages < cfg.sessions.rebuildMaxPages) {
        const page = await api.conversationsList(
          { ...requestParams(), cursor: cur },
          { signal: listController.signal },
        );
        if (myGen !== gen) return;
        rows = rows.concat(page.items as ListRow[]);
        cur = page.next_cursor ?? null;
        more = Boolean(page.has_more);
        pages += 1;
      }
      items.value = uniqueById(rows);
      cursor.value = cur;
      hasMore.value = more;
    } catch (err) {
      if (myGen === gen) error.value = err;
    } finally {
      if (myGen === gen) loading.value = false;
    }
  }

  async function loadMore(): Promise<boolean> {
    if (loading.value || loadingMore.value || !hasMore.value || cursor.value == null) return false;
    const myGen = gen;
    loadingMore.value = true;
    try {
      const page = await api.conversationsList(
        { ...requestParams(), cursor: cursor.value },
        { signal: listController.signal },
      );
      if (myGen !== gen) return false;
      items.value = uniqueById([...items.value, ...(page.items as ListRow[])]);
      cursor.value = page.next_cursor ?? null;
      hasMore.value = Boolean(page.has_more);
      return true;
    } catch (err) {
      if (myGen === gen) error.value = err;
      return false;
    } finally {
      if (myGen === gen) loadingMore.value = false;
    }
  }

  // Every folder, for the path and the names; a folder shown that is gone leaves for the root.
  let folderRequest = 0;
  async function loadFolders() {
    const request = ++folderRequest;
    const generation = gen;
    try {
      const incoming = await api.foldersList({ signal: listController.signal });
      if (request !== folderRequest || generation !== gen) return;
      folders.value = new Map(incoming.map((item) => [item.id, item]));
      if (folder.value && !folders.value.has(folder.value)) open(null);
    } catch {
      /* The path falls back to the folder's id until the next reading. */
    }
  }

  /** Shows a folder's listing in place of the list: null for the root. */
  function open(id: string | null) {
    if (id === folder.value) return;
    folder.value = id;
    try {
      platform('storage').set(folderKey(), id ?? '');
    } catch {
      /* the list opens at the root next time */
    }
    bump();
    items.value = [];
    loadFirst();
  }

  const debouncedSearch = debounce(() => {
    loadFirst();
  }, cfg.sessions.searchDebounceMs);
  function setQuery(q: string) {
    if (q === query.value) return;
    query.value = q;
    bump();
    debouncedSearch();
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

  async function create({
    name,
    provider,
    model,
    reasoningEffort,
    agentCustom,
    cwd,
    folder: into,
  }: SessionCreateInput): Promise<SessionView> {
    const body: CreateSessionBody = { provider, model, folder: into ?? null };
    if (name) body.name = name;
    if (cwd != null) body.cwd = cwd;
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    if (agentCustom != null && agentCustom !== '') body.agent_custom = agentCustom;
    const snap = await api.sessionCreate(body);
    // The new row's position depends on the active collection (folder, filters,
    // ordering) — the server is the single sorting authority.
    await rebuild();
    return snap;
  }

  async function rename(id: string, name: string): Promise<SessionView> {
    return edits.run(
      [id],
      (row) => ({ ...row, name }),
      () => api.sessionRename(id, name),
      (snap) => {
        patchRow(id, (row) => ({ ...row, name: snap.name, revision: snap.revision }));
        debouncedRebuild();
      },
    );
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
    return edits
      .run(
        [id],
        (item) => (item.kind === 'session' ? { ...item, metadata: next } : item),
        () => api.sessionUpdateMeta(id, next, row.revision),
        (snap) => {
          patchRow(id, (item) =>
            item.kind === 'session' ? { ...item, metadata: snap.metadata, revision: snap.revision } : item,
          );
          const tags = metaOf(snap).tags;
          if (tagFilter.value && (!Array.isArray(tags) || !tags.includes(tagFilter.value))) dropRow(id);
          debouncedRebuild();
        },
      )
      .catch((cause) => {
        debouncedRebuild();
        throw cause;
      });
  }

  function dropRow(id: string) {
    items.value = items.value.filter((s) => s.id !== id);
  }

  const deletions = new Map<string, Promise<unknown>>();
  function removeRow(id: string, write: () => Promise<unknown>) {
    const existing = deletions.get(id);
    if (existing) return existing;
    removing.value = new Set([...removing.value, id]);
    const request = Promise.resolve()
      .then(write)
      .then(() => {
        dropRow(id);
        debouncedRebuild();
      })
      .finally(() => {
        deletions.delete(id);
        removing.value = new Set([...removing.value].filter((value) => value !== id));
      });
    deletions.set(id, request);
    return request;
  }
  async function createFolder(name: string, parent: string | null): Promise<FolderView> {
    const draft: FolderRow = {
      kind: 'folder',
      pending: true,
      id: requestId(),
      name,
      parent,
      pinned: false,
      created_at: Date.now(),
    };
    pendingFolders.value = [...pendingFolders.value, draft];
    try {
      const made = await api.folderCreate(name, parent);
      const updated = new Map(folders.value);
      updated.set(made.id, made);
      folders.value = updated;
      if (!filtered.value && folder.value === parent)
        items.value = uniqueById([...items.value, { kind: 'folder', ...made }]).sort(placementOrder);
      debouncedRebuild();
      return made;
    } finally {
      pendingFolders.value = pendingFolders.value.filter((row) => row !== draft);
    }
  }
  async function renameFolder(id: string, name: string): Promise<FolderView> {
    return edits.run(
      [id],
      (row) => ({ ...row, name }),
      () => api.folderRename(id, name),
      (renamed) => {
        patchRow(id, (row) => ({ ...row, name: renamed.name }), true);
        void loadFolders();
      },
    );
  }
  /** Deletes a folder; what it held goes up to the folder it was in. */
  async function deleteFolder(id: string): Promise<void> {
    await removeRow(id, () => api.folderDelete(id));
  }
  /** Moves sessions and folders into `into` (null for the root). What leaves the folder
   *  shown leaves the list at once, and the folder it goes into counts it; the server's reading
   *  follows and settles both. */
  async function move(ids: string[], into: string | null): Promise<void> {
    if (!filtered.value && into !== folder.value) {
      const leaving = new Set(ids);
      items.value = items.value
        .filter((row) => !leaving.has(row.id))
        .map((row) =>
          row.kind === 'folder' && row.id === into ? { ...row, items: (row.items ?? 0) + ids.length } : row,
        );
    }
    try {
      await api.entriesMove(ids, into);
    } finally {
      await rebuild();
    }
  }
  async function pin(ids: string[], pinned: boolean): Promise<void> {
    const targets = new Set(ids);
    await edits.run(
      ids,
      (row) => ({ ...row, pinned }),
      () => api.entriesPin(ids, pinned),
      () => {
        const updated = items.value.map((row) => (targets.has(row.id) ? { ...row, pinned } : row));
        items.value = filtered.value ? updated : updated.sort(placementOrder);
        debouncedRebuild();
      },
    );
  }

  // Live invalidation from the control-plane stream. Every change can move an entry (its name,
  // update time, metadata and place decide order and membership), so the list refetches.
  const debouncedRebuild = debounce(() => {
    rebuild();
  }, cfg.sessions.searchDebounceMs * 2);
  bus.on('upsert.session', (u: SessionUpsert) => {
    if ((u.body ?? u)?.id) debouncedRebuild();
  });
  bus.on('tombstone.session', (t: SessionTombstone) => {
    if (t?.id) dropRow(t.id);
  });
  bus.on('list.changed', () => debouncedRebuild());
  // Authoritative snapshot (reconnect / cursor reset): rebuild the
  // collection — membership, order and cursor are all re-derived.
  bus.on(
    'sync.snapshot',
    debounce(() => {
      rebuild();
    }, 300),
  );

  return {
    hydrate,
    items: list,
    hasMore,
    loading,
    loadingMore,
    error,
    query,
    tagFilter,
    filtered,
    folder,
    path,
    folders,
    loadFirst,
    loadMore,
    open,
    setQuery,
    setTagFilter,
    refresh,
    create,
    rename,
    displayName: (session: SessionView) =>
      edits.project({ ...session, kind: 'session', parent: null, pinned: false }).name,
    updateMeta,
    dropRow,
    createFolder,
    removeRow,
    removing,
    renameFolder,
    deleteFolder,
    move,
    pin,
  };
})();
export type SessionsApi = typeof sessions;

function readFolder(): string | null {
  try {
    return platform('storage').get(folderKey()) || null;
  } catch {
    return null;
  }
}
