// Session-owned execution. Live deltas are transient; paged history is authoritative.
import { shallowRef, watch } from 'vue';
import { cfg } from '../config.ts';
import { bus } from '../bus.ts';
import { platform } from '../../platform/index.ts';
import { createSse, type SseConnection } from '../api/sse.ts';
import { errorDetail } from '../errors.ts';
import { absUrl, getConnectionScope } from '../api/client.ts';
import { createBoundedCache } from '../util/boundedCache.ts';
import { createChatDeliveries } from './chatDeliveries.ts';
import { createPendingMessages, type MessageDraft } from './pendingMessages.ts';
import { userInputRequestId } from '../api/userContent.ts';
import type { AttachmentInput } from '../attachments.ts';
import { sessionNaming } from './sessionNaming.ts';
import * as api from '../api/endpoints.ts';
import { createReconciliation } from './reconciliation.ts';
import { createChatHistory } from './chatHistory.ts';
import { createEmptyStream, createStreamProcessor } from './chatStream.ts';
import type { EntryView, SessionView } from '../api/projections.ts';
import type { SessionUpsert } from './syncSlice.ts';

// What the open session's model accepts as input; null modalities = unknown.
export interface SessionCapabilities {
  input_modalities: string[] | null;
}
export interface CapabilitiesOk {
  status: 'ok';
  data: SessionCapabilities;
}
export interface CapabilitiesErr {
  status: 'error';
  error: unknown;
}
export type ChatCapabilities = CapabilitiesOk | CapabilitiesErr;

/** How long a draft waits after the last keystroke before it reaches storage. */
export const DRAFT_PERSIST_MS = 400;

export interface DraftStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
export interface DraftWriter {
  read(id: string): string;
  write(id: string, text: string): void;
  /** Land one draft, or every draft waiting. */
  flush(id?: string): void;
  hasPending(id?: string): boolean;
}

/** Drafts are written a moment after typing stops rather than on every keystroke. The pending
 *  text stays here, so reading a draft returns what was typed, not what was persisted last.
 *  Emptying a field lands at once (that is a message going out), and a draft that is still
 *  waiting when another id is written lands first (the composer has moved on). */
export function createDraftWriter(store: DraftStorage, delayMs = DRAFT_PERSIST_MS): DraftWriter {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const key = (id: string) => `draft.${id}`;
  function land(id: string) {
    if (!pending.has(id)) return;
    const text = pending.get(id)!;
    pending.delete(id);
    store.set(key(id), text);
  }
  function flush(id?: string) {
    if (id != null) {
      land(id);
      return;
    }
    clearTimeout(timer);
    timer = undefined;
    for (const pendingId of [...pending.keys()]) land(pendingId);
  }
  return {
    read: (id) => pending.get(id) ?? store.get(key(id)) ?? '',
    write(id, text) {
      for (const other of [...pending.keys()]) if (other !== id) land(other);
      pending.set(id, text);
      clearTimeout(timer);
      if (text === '') {
        flush();
        return;
      }
      timer = setTimeout(() => flush(), delayMs);
    },
    flush,
    hasPending: (id) => (id == null ? pending.size > 0 : pending.has(id)),
  };
}

export interface ChatDependencies {
  requests?: Partial<typeof api>;
  connect?: typeof createSse;
  url?: typeof absUrl;
}

// Composition root: each instance owns its requests, subscription and history window.
// The application exports one instance below; tests and alternate hosts need no global mocks.
export function createChat(deps: ChatDependencies = {}) {
  const requests = { ...api, ...deps.requests };
  const connect = deps.connect ?? createSse;
  const url = deps.url ?? absUrl;
  const sessionId = shallowRef<string | null>(null);
  const snapshot = shallowRef<SessionView | null>(null);
  const missingSessionId = shallowRef<string | null>(null);
  const loadingInitial = shallowRef(false);
  const stream = shallowRef(createEmptyStream());
  const capabilities = shallowRef<ChatCapabilities | null>(null);

  const windows = createBoundedCache(8, 2_000_000);
  const windowKey = (id: string) => `${getConnectionScope()}
${id}`;
  let cachedSnapshot: SessionView | null = null;
  let epoch = 0;
  let initialized = false;
  let initialTask: Promise<void> | null = null;
  let visible = true;
  let denied = false;
  let liveVersion = 0;
  let controller: AbortController | null = null;
  let connection: SseConnection | null = null;
  let offSync: (() => void) | null = null;
  const reconciliation = createReconciliation({
    run: refresh,
    ready: () => visible && !denied && !!sessionId.value && !loadingInitial.value,
    delayMs: cfg.history.reconcileDelayMs,
    pollMs: cfg.sync.pollFallbackMs,
  });
  // The storage adapter is looked up per call: the platform registers its adapters after import.
  const drafts = createDraftWriter({
    get: (key) => platform('storage').get(key),
    set: (key, value) => platform('storage').set(key, value),
  });

  const current = (e: number) => e === epoch;
  const options = () => ({ signal: controller?.signal });

  const deliveryState = createChatDeliveries({
    sessionId,
    snapshot,
    stream,
    options,
    requests,
    scheduleRefresh,
  });
  const { sending, sentRun, deliveries, send, refreshDeliveries, moveQueued, cancelQueued } = deliveryState;

  const history = createChatHistory<EntryView>({
    sessionId,
    onError: reportOperationError,
    options,
    open,
    readPage: requests.historyPage,
  });
  const {
    entries,
    hasMoreBefore,
    hasMoreAfter,
    pendingSeq,
    loadingOlder,
    loadingNewer,
    locating,
    bounds,
    loadOlder,
    fetchNewer,
    locate: locateHistory,
    jumpToLatest,
    clearPendingSeq,
  } = history;

  const pending = createPendingMessages({
    send: requests.messageSend,
    supportsRequestId: requests.supportsInputRequestId,
    settled: (owner) => {
      if (sessionId.value === owner) scheduleRefresh();
    },
    accepted(owner, receipt) {
      if (receipt.first_user_message) void sessionNaming.generate(owner, receipt.entry);
      if (sessionId.value === owner) scheduleRefresh();
    },
  });
  watch([entries, deliveries, pending.messages], () => {
    const owner = sessionId.value;
    if (!owner || !pending.messages.value.some((item) => item.owner === owner)) return;
    const echoed = new Set(deliveries.value.map((item) => item.id));
    const requestIds = new Set(
      deliveries.value.flatMap((item) => (item.client_request_id ? [item.client_request_id] : [])),
    );
    for (const entry of entries.value) {
      if (entry.kind !== 'user_message') continue;
      echoed.add(String(entry.id));
      const request = userInputRequestId(entry.payload.metadata);
      if (request) requestIds.add(request);
    }
    pending.reconcile(owner, echoed, requestIds);
  });
  function stageMessage(
    owner: string,
    text: string,
    attachments: AttachmentInput[],
    draft: MessageDraft,
    metadata?: unknown,
  ) {
    if (sessionId.value !== owner) return null;
    const queued = shouldQueue(owner);
    const id = pending.enqueue(owner, { text, attachments, metadata }, draft, queued);
    if (!queued) sentRun.value = { sessionId: owner, deliveryId: id };
    return id;
  }
  function shouldQueue(owner: string) {
    return (
      stream.value.active ||
      snapshot.value?.phase === 'queued' ||
      pending.messages.value.some((item) => item.owner === owner && !item.queued && item.state !== 'failed')
    );
  }
  function retryPendingMessage(id: string) {
    const owner = sessionId.value;
    if (!owner || !pending.messages.value.some((item) => item.id === id && item.owner === owner)) return;
    const queued = shouldQueue(owner);
    if (pending.retry(id, queued) && !queued) sentRun.value = { sessionId: owner, deliveryId: id };
  }

  const streamProcessor = createStreamProcessor({
    onClose() {
      markMissing();
    },
    onHistoryPruned() {
      void reload(false);
    },
    onNotice(message) {
      bus.emit('notice', { text: message, tone: 'warning' });
    },
    onScheduleRefresh() {
      scheduleRefresh();
    },
    onTurnComplete(kind, turnVersion) {
      if (history.viewingPast()) return;
      if (loadingInitial.value) {
        scheduleRefresh();
        return;
      }
      const own = epoch;
      void fetchNewer({ reportError: false })
        .then((result) => {
          if (
            current(own) &&
            turnVersion === streamProcessor.getTurnVersion() &&
            result.ok &&
            result.drained &&
            ['ResponseAccepted', 'ResponseInterrupted'].includes(kind)
          ) {
            stream.value = {
              ...stream.value,
              text: '',
              reasoning: '',
              toolCalls: {},
            };
          }
        })
        .catch(() => {
          if (current(own)) scheduleRefresh();
        });
    },
    onError(cause) {
      console.warn('Invalid session event', cause);
    },
  });

  function close(keepWindow = true) {
    const owner = sessionId.value;
    if (
      keepWindow &&
      owner &&
      initialized &&
      snapshot.value?.id === owner &&
      !history.viewingPast() &&
      !locating.value
    ) {
      const tail = entries.value.slice(-cfg.history.pageSize);
      windows.set(
        windowKey(owner),
        JSON.stringify({
          snapshot: snapshot.value,
          entries: tail,
          hasMoreBefore: hasMoreBefore.value || tail.length < entries.value.length,
        }),
      );
    }
    cachedSnapshot = null;
    epoch++;
    initialized = false;
    denied = false;
    initialTask = null;
    loadingInitial.value = false;
    history.invalidate();
    deliveryState.reset();
    controller?.abort();
    connection?.close();
    offSync?.();
    reconciliation.stop();
    connection = null;
    sessionId.value = null;
    streamProcessor.reset();
  }

  // What the page shows of a session, emptied.
  function clearView() {
    snapshot.value = null;
    entries.value = [];
    deliveries.value = [];
    stream.value = createEmptyStream();
    loadingOlder.value = false;
    loadingNewer.value = false;
  }

  function forgetConversation(id: string) {
    windows.set(windowKey(id), '');
    pending.forget(id);
  }

  function markMissing() {
    const id = sessionId.value;
    if (id) forgetConversation(id);
    close(false);
    clearView();
    loadingInitial.value = false;
    missingSessionId.value = id;
  }

  // Only a session lookup can establish that the session itself is missing.
  async function getSession(id: string, own: number): Promise<SessionView> {
    try {
      return await requests.sessionGet(id, options());
    } catch (cause: any) {
      if (current(own) && [404, 410].includes(cause?.status)) markMissing();
      throw cause;
    }
  }

  function deny(cause: unknown) {
    const status = (cause as { status?: number } | null)?.status;
    if (status !== 401 && status !== 403) return false;
    if (!denied) {
      denied = true;
      reconciliation.stop();
      connection?.close();
      bus.emit('connection.denied');
    }
    return true;
  }

  function reportOperationError(cause: unknown) {
    if (!deny(cause) && (cause as Error | null)?.name !== 'AbortError')
      bus.emit('notice', { text: errorDetail(cause), tone: 'error' });
  }

  async function open(id: string, reportError = false, useCache = true): Promise<void> {
    if (sessionId.value === id) {
      await initialTask?.catch(() => {});
      return;
    }
    drafts.flush(); // leaving the last session: its draft lands before the switch
    close();

    sessionId.value = id;
    missingSessionId.value = null;
    controller = new AbortController();
    const own = epoch;

    history.resume();
    clearView();
    bounds();
    hasMoreBefore.value = false;
    hasMoreAfter.value = false;
    loadingInitial.value = true;
    locating.value = false;
    sending.value = false;
    sentRun.value = null;
    pendingSeq.value = null;
    capabilities.value = { status: 'ok', data: { input_modalities: null } };

    const cached = useCache ? windows.get(windowKey(id)) : undefined;
    if (cached) {
      const saved = JSON.parse(cached) as { snapshot: SessionView; entries: EntryView[]; hasMoreBefore: boolean };
      cachedSnapshot = saved.snapshot;
      snapshot.value = saved.snapshot;
      entries.value = saved.entries;
      hasMoreBefore.value = saved.hasMoreBefore;
      bounds();
    }

    reconciliation.start();

    // Subscribe before the initial snapshot: reconciliation covers any racing commit.
    connection = connect({
      url: url(`/sessions/${encodeURIComponent(id)}/events`),
      paused: !visible,
      onFrame: (f) => {
        if (current(own)) {
          liveVersion++;
          const next = streamProcessor.processFrame(f.data, stream.value);
          if (current(own)) stream.value = next;
        }
      },
      onState: ({ state: s, err }) => {
        if (!current(own)) return;
        if (s === 'gone') {
          markMissing();
          return;
        }
        if (s === 'denied') deny(err);
        if (s === 'open') scheduleRefresh();
      },
    });

    offSync = bus.on('upsert.session', (event: SessionUpsert) => {
      if (current(own) && event.id === id) scheduleRefresh();
    });

    try {
      initialTask = initialize(id, own);
      await initialTask;
    } catch (cause) {
      if (current(own) && !deny(cause) && reportError) reportOperationError(cause);
    } finally {
      if (current(own)) scheduleRefresh();
    }
  }

  async function initialize(id: string, own: number) {
    loadingInitial.value = true;
    const version = liveVersion;
    try {
      const [snap, page] = await Promise.all([
        getSession(id, own),
        requests.historyPage(id, { limit: cfg.history.pageSize, order: 'desc' }, options()),
      ]);
      if (!current(own)) return;
      if (snapshot.value === cachedSnapshot) snapshot.value = snap;
      else adoptSnapshot(id, snap);
      cachedSnapshot = null;
      entries.value = page.items.slice().reverse();
      bounds();
      hasMoreBefore.value = page.has_more;
      // Events arriving while the HTTP read was in flight already describe a newer run.
      if (liveVersion === version)
        stream.value = {
          ...stream.value,
          active: snap.running,
          phase: snap.running ? 'pending' : 'idle',
        };
      initialized = true;
      // Queue reads are independent of showing history; a slow queue must not hold
      // the initial-loading gate (and therefore pagination) closed.
      void refreshDeliveries().catch(() => {
        if (current(own)) scheduleRefresh();
      });
    } finally {
      if (current(own)) {
        loadingInitial.value = false;
        initialTask = null;
      }
    }
  }

  async function locate(id: string, seq: number): Promise<boolean> {
    // Search may be invoked while this same session is still opening. Wait for
    // its initial window before replacing it, otherwise the late tail overwrites search.
    await open(id);
    if (sessionId.value !== id || !initialized) return false;
    return locateHistory(id, seq);
  }

  async function reload(reportError = true): Promise<void> {
    const id = sessionId.value;
    if (id) {
      close(false);
      await open(id, reportError, false);
    }
  }

  async function refresh() {
    if (!sessionId.value || !visible || denied) return;
    // Initial history may be completing a large album. Reconciliation must not publish a
    // separate partial window (from sequence zero) while that atomic read is still pending.
    if (loadingInitial.value) {
      scheduleRefresh();
      return;
    }
    const own = epoch;
    const id = sessionId.value;

    try {
      if (!initialized) {
        initialTask = initialize(id, own);
        await initialTask;
        if (current(own)) scheduleRefresh();
        return;
      }
      const version = liveVersion;
      const snap = await getSession(id, own);
      if (!current(own)) return;
      adoptSnapshot(id, snap);

      const result = history.viewingPast() ? { ok: false, drained: false } : await fetchNewer({ reportError: false });
      if (!current(own)) return;

      await refreshDeliveries();
      if (!current(own)) return;

      if (liveVersion !== version || (snapshot.value?.revision ?? 0) > snap.revision) {
        scheduleRefresh();
        return;
      }
      if (!snap.running && result.ok && result.drained) {
        stream.value = { ...createEmptyStream(), error: stream.value.error };
      } else {
        stream.value = { ...stream.value, active: snap.running || stream.value.active };
      }

      if (result.ok && !result.drained) scheduleRefresh();
    } catch (cause) {
      if (current(own)) deny(cause);
    }
  }

  function setVisible(next: boolean) {
    visible = next;
    if (!visible) connection?.pause();
  }

  function reconnectNow() {
    if (!visible || denied) return;
    connection?.reconnectNow();
    scheduleRefresh();
  }

  function scheduleRefresh() {
    reconciliation.request();
  }

  const retryingRun = shallowRef(false);
  async function retryRun(id: string): Promise<void> {
    if (retryingRun.value || id !== sessionId.value || snapshot.value?.running) return;
    retryingRun.value = true;
    try {
      await requests.sessionRun(id);
      if (sessionId.value === id) await refresh();
    } finally {
      retryingRun.value = false;
    }
  }

  async function interrupt(): Promise<void> {
    if (sessionId.value) {
      const own = epoch;
      await requests.sessionInterrupt(sessionId.value);
      if (current(own)) scheduleRefresh();
    }
  }

  function getDraft(id: string | null = sessionId.value): string {
    return id ? drafts.read(id) : '';
  }

  function setDraft(text: string, id: string | null = sessionId.value) {
    if (id) drafts.write(id, text);
  }

  /** Land waiting drafts now: a sent message, a session switch, a closing page. */
  function flushDrafts(id?: string) {
    drafts.flush(id);
  }

  /** Shows a snapshot the server returned for a change made here, unless the open session is
   *  another one or already shows a newer revision. */
  function adoptSnapshot(id: string, next: SessionView) {
    if (sessionId.value === id && (snapshot.value?.revision ?? 0) <= next.revision) snapshot.value = next;
  }

  async function reloadCapabilities(): Promise<void> {
    const own = epoch;
    const id = sessionId.value;
    if (!id) return;
    try {
      const data = await requests.sessionCapabilities(id, options());
      if (current(own)) capabilities.value = { status: 'ok', data };
    } catch (cause) {
      if (current(own)) capabilities.value = { status: 'error', error: cause };
    }
  }

  return {
    missingSessionId,
    sessionId,
    snapshot,
    entries,
    hasMoreBefore,
    hasMoreAfter,
    pendingSeq,
    loadingOlder,
    loadingNewer,
    loadingInitial,
    stream,
    sending,
    sentRun,
    capabilities,
    deliveries,
    pendingMessages: pending.messages,
    stageMessage,
    acceptInitialMessage: pending.acceptInitial,
    discardPendingMessage: pending.discard,
    retryPendingMessage,
    forgetConversation,
    checkPendingMessage: scheduleRefresh,
    open,
    close,
    reload,
    setVisible,
    reconnectNow,
    loadOlder,
    fetchNewer,
    locate,
    jumpToLatest,
    send,
    cancelQueued,
    moveQueued,
    interrupt,
    retryRun,
    retryingRun,
    getDraft,
    setDraft,
    flushDrafts,
    clearPendingSeq,
    reloadCapabilities,
    adoptSnapshot,
  };
}
export const chat = createChat();
export type ChatApi = typeof chat;
