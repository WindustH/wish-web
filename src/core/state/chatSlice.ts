// Session-owned execution. Live deltas are transient; paged history is authoritative.
import { shallowRef, computed } from 'vue';
import { cfg } from '../config.ts';
import { bus } from '../bus.ts';
import { platform } from '../../platform/index.ts';
import { createSse, type SseConnection } from '../api/sse.ts';
import { absUrl } from '../api/client.ts';
import { createChatDeliveries } from './chatDeliveries.ts';
import * as api from '../api/endpoints.ts';
import { createChatHistory } from './chatHistory.ts';
import { createEmptyStream, createStreamProcessor } from './chatStream.ts';
import type { EntryView, SessionView } from '../api/projections.ts';
import type { SessionUpsert } from './syncSlice.ts';

// What the open session's model accepts as input; null modalities = unknown.
export interface SessionCapabilities { input_modalities: string[] | null }
export interface CapabilitiesOk { status: 'ok'; data: SessionCapabilities }
export interface CapabilitiesErr { status: 'error'; error: unknown }
export type ChatCapabilities = CapabilitiesOk | CapabilitiesErr;

export const chat = (() => {
  const sessionId = shallowRef<string | null>(null);
  const snapshot = shallowRef<SessionView | null>(null);
  const missingSessionId = shallowRef<string | null>(null);
  const loadingInitial = shallowRef(false);
  const error = shallowRef<any>(null);
  const stream = shallowRef(createEmptyStream());
  const capabilities = shallowRef<ChatCapabilities | null>(null);

  const isActive = computed(() => sessionId.value !== null);
  const phase = computed(() => snapshot.value?.phase ?? 'idle');

  let epoch = 0;
  let controller: AbortController | null = null;
  let connection: SseConnection | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let offSync: (() => void) | null = null;
  let refreshing = false;
  let connectionError: unknown = null;

  const current = (e: number) => e === epoch;
  const options = () => ({ signal: controller?.signal });

  const deliveryState = createChatDeliveries({
    sessionId, snapshot, stream, error, options,
    scheduleRefresh,
  });
  const { sending, sentRun, deliveries, send, refreshDeliveries, moveQueued, cancelQueued } = deliveryState;

  const history = createChatHistory<EntryView>({
    sessionId, error, options, open,
    readPage: api.historyPage,
  });
  const {
    entries, oldestSeq, newestSeq, historyVersion, hasMoreBefore, hasMoreAfter,
    pendingSeq, loadingOlder, loadingNewer, locating, bounds,
    loadOlder, fetchNewer, locate, jumpToLatest, cancelLocate, clearPendingSeq,
  } = history;

  const streamProcessor = createStreamProcessor({
    onClose() {
      markMissing();
    },
    onScheduleRefresh() {
      scheduleRefresh();
    },
    onTurnComplete(kind, turnVersion) {
      if (history.viewingPast()) return;
      const own = epoch;
      void fetchNewer().then((result) => {
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
      });
    },
    onError(cause) {
      error.value = cause;
    },
  });

  function close() {
    epoch++;
    history.invalidate();
    deliveryState.reset();
    controller?.abort();
    connection?.close();
    offSync?.();
    clearTimeout(timer);
    clearInterval(poll);
    connection = null;
    sessionId.value = null;
    refreshing = false;
    streamProcessor.reset();
  }

  function markMissing() {
    const id = sessionId.value;
    close();
    snapshot.value = null;
    entries.value = [];
    deliveries.value = [];
    stream.value = createEmptyStream();
    loadingInitial.value = false;
    loadingOlder.value = false;
    loadingNewer.value = false;
    missingSessionId.value = id;
  }

  // Only a session lookup can establish that the session itself is missing.
  async function getSession(id: string, own: number): Promise<SessionView> {
    try {
      return await api.sessionGet(id, options());
    } catch (cause: any) {
      if (current(own) && [404, 410].includes(cause?.status)) markMissing();
      throw cause;
    }
  }

  async function open(id: string): Promise<void> {
    if (sessionId.value === id) return;
    close();

    sessionId.value = id;
    missingSessionId.value = null;
    controller = new AbortController();
    const own = epoch;

    history.resume();
    snapshot.value = null;
    entries.value = [];
    bounds();
    hasMoreBefore.value = false;
    hasMoreAfter.value = false;
    loadingOlder.value = false;
    loadingNewer.value = false;
    loadingInitial.value = true;
    locating.value = false;
    sending.value = false;
    error.value = null;
    stream.value = createEmptyStream();
    sentRun.value = null;
    pendingSeq.value = null;
    deliveries.value = [];
    capabilities.value = { status: 'ok', data: { input_modalities: null } };

    // Subscribe before the initial snapshot: reconciliation covers any racing commit.
    connection = createSse({
      url: absUrl(`/sessions/${encodeURIComponent(id)}/events`),
      onFrame: (f) => {
        if (current(own)) {
          const next = streamProcessor.processFrame(f.data, stream.value);
          if (current(own)) stream.value = next;
        }
      },
      onState: ({ state: s, err }) => {
        if (!current(own)) return;
        if (s === 'gone') { markMissing(); return; }
        if (s === 'denied' || (s === 'reconnecting' && err)) {
          connectionError = err;
          error.value = err;
        }
        if (s === 'open') {
          if (error.value === connectionError) error.value = null;
          connectionError = null;
          scheduleRefresh();
        }
      },
    });

    offSync = bus.on('upsert.session', (event: SessionUpsert) => {
      if (current(own) && event.id === id) scheduleRefresh();
    });

    try {
      const [snap, page] = await Promise.all([
        getSession(id, own),
        api.historyPage(id, { limit: cfg.history.pageSize, order: 'desc' }, options()),
      ]);
      if (!current(own)) return;

      snapshot.value = snap;
      entries.value = page.items.slice().reverse();
      bounds();
      hasMoreBefore.value = page.has_more;
      stream.value = {
        ...stream.value,
        active: snap.running,
        phase: snap.running ? 'pending' : 'idle',
      };
      await refreshDeliveries();
    } catch (cause) {
      if (current(own)) error.value = cause;
    } finally {
      if (current(own)) loadingInitial.value = false;
    }

    if (!current(own)) return;
    poll = setInterval(() => {
      if (current(own)) void refresh();
    }, cfg.sync.pollFallbackMs);
  }

  async function reload(): Promise<void> {
    const id = sessionId.value;
    if (id) {
      close();
      await open(id);
    }
  }

  async function refresh() {
    if (refreshing || !sessionId.value) return;
    refreshing = true;
    const own = epoch;
    const id = sessionId.value;

    try {
      const snap = await getSession(id, own);
      if (!current(own)) return;
      snapshot.value = snap;

      const result = history.viewingPast() ? { ok: false, drained: false } : await fetchNewer();
      if (!current(own)) return;

      await refreshDeliveries();
      if (!current(own)) return;

      if (!snap.running && result.ok && result.drained) {
        stream.value = { ...createEmptyStream(), error: stream.value.error };
      } else {
        stream.value = { ...stream.value, active: snap.running || stream.value.active };
      }

      if (result.ok && !result.drained) scheduleRefresh();
    } catch (cause) {
      if (current(own)) error.value = cause;
    } finally {
      if (current(own)) refreshing = false;
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, cfg.history.reconcileDelayMs);
  }

  async function interrupt(): Promise<void> {
    if (sessionId.value) {
      const own = epoch;
      try { await api.sessionInterrupt(sessionId.value); }
      catch (cause) { if (current(own)) error.value = cause; throw cause; }
      if (current(own)) scheduleRefresh();
    }
  }

  function getDraft(id: string | null = sessionId.value): string {
    return id ? platform('storage').get(`draft.${id}`) ?? '' : '';
  }

  function setDraft(text: string, id: string | null = sessionId.value) {
    if (id) platform('storage').set(`draft.${id}`, text);
  }

  async function reloadCapabilities(): Promise<void> {
    const own = epoch;
    const id = sessionId.value;
    if (!id) return;
    try {
      const data = await api.sessionCapabilities(id, options());
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
    oldestSeq,
    newestSeq,
    historyVersion,
    hasMoreBefore,
    hasMoreAfter,
    pendingSeq,
    loadingOlder,
    loadingNewer,
    loadingInitial,
    locating,
    error,
    stream,
    sending,
    sentRun,
    capabilities,
    deliveries,
    isActive,
    phase,
    open,
    close,
    reload,
    loadOlder,
    fetchNewer,
    locate,
    jumpToLatest,
    send,
    refreshDeliveries,
    cancelQueued,
    moveQueued,
    interrupt,
    getDraft,
    setDraft,
    cancelLocate,
    clearPendingSeq,
    reloadCapabilities,
  };
})();
export type ChatApi = typeof chat;
