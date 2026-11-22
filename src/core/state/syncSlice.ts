import { shallowRef } from 'vue';
import { readUpstreamRetry } from '../upstreamRetry.ts';
import { operationFailure } from '../api/failures.ts';
import { bus } from '../bus.ts';
import { createSse, type SseConnection, type SseFrame, type SseOptions } from '../api/sse.ts';
import { absUrl } from '../api/client.ts';
import { sessionGet } from '../api/endpoints.ts';
import { createKeyedRefresh } from '../util/keyedRefresh.ts';
import type { SessionView } from '../api/projections.ts';

// Bus payloads published by this slice.
export interface SessionUpsert {
  id: string;
  body: SessionView;
}
export interface SessionTombstone {
  id: string;
}

interface SyncDependencies {
  connect?: (options: SseOptions) => Pick<SseConnection, 'close' | 'pause' | 'reconnectNow'>;
  readSession?: (id: string, signal: AbortSignal) => Promise<SessionView>;
  url?: (path: string) => string;
  emit?: typeof bus.emit;
}
const DISCONNECT_DELAY_MS = 8_000;
const DISCONNECT_FAILURES = 3;

export function createSync({
  connect = createSse,
  readSession = (id, signal) => sessionGet(id, { signal }),
  url = absUrl,
  emit = bus.emit,
}: SyncDependencies = {}) {
  const state = shallowRef<'online' | 'reconnecting' | 'disconnected'>('reconnecting');
  const authorizationDenied = shallowRef(false);
  /** Bumped on every sync.snapshot frame; 1 = initial, >1 = reconnect/reset. */
  const snapshotRevision = shallowRef(0);
  const protocolError = shallowRef<unknown>(null);
  let connection: ReturnType<NonNullable<SyncDependencies['connect']>> | undefined;
  let generation = 0;
  let visible = true;
  let failures = 0;
  let lostAt = 0;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const sessions = createKeyedRefresh(
    (id: string, signal: AbortSignal): Promise<SessionView> => readSession(id, signal),
    (id: string, body: SessionView) => emit('upsert.session', { id, body }),
    (id: string, error: unknown) => {
      const status = (error as { status?: number } | null)?.status;
      if (status === 404 || status === 410) emit('tombstone.session', { id });
    },
  );

  function resetLoss() {
    clearTimeout(noticeTimer);
    noticeTimer = undefined;
    failures = 0;
    lostAt = Date.now();
  }

  function reportIfDisconnected() {
    if (!visible || state.value !== 'reconnecting' || failures < DISCONNECT_FAILURES) return;
    const remaining = DISCONNECT_DELAY_MS - (Date.now() - lostAt);
    if (remaining <= 0) state.value = 'disconnected';
    else if (noticeTimer === undefined) {
      noticeTimer = setTimeout(() => {
        noticeTimer = undefined;
        reportIfDisconnected();
      }, remaining);
    }
  }

  function frame(frame: SseFrame) {
    if (!frame.data) return;
    try {
      const event = JSON.parse(frame.data);
      if (event.type === 'snapshot' || event.type === 'gap') {
        sessions.clear();
        snapshotRevision.value++;
        emit('sync.snapshot', { sessionFailures: event.session_failures === true });
      } else if (event.type === 'session_retry' && event.id) {
        const retry = readUpstreamRetry(event.retry);
        if (retry?.phase === 'waiting') emit('session.retry', { id: event.id, name: event.name, retry });
      } else if (
        event.type === 'session_recovery' &&
        event.id &&
        Number.isInteger(event.attempt) &&
        event.attempt > 0
      ) {
        emit('session.recovery', { id: event.id, name: event.name, attempt: event.attempt });
      } else if (event.type === 'session_failed' && event.id) {
        const failure = operationFailure(event.ending);
        if (failure) emit('session.failed', { id: event.id, name: event.name, failure });
      } else if (event.type === 'configuration_changed') {
        emit('configuration.changed', {});
      } else if (event.type === 'session_archived') {
        emit('archives.changed');
      } else if (event.type === 'session_deleted') {
        sessions.invalidate(event.id);
        emit('tombstone.session', { id: event.id });
      } else if (event.type === 'session_changed') {
        void sessions.refresh(event.id);
      } else if (event.type === 'list_changed') {
        emit('list.changed', {});
      }
    } catch (error) {
      protocolError.value ??= error;
    }
  }

  function start() {
    if (connection) return;
    const started = ++generation;
    resetLoss();
    connection = connect({
      url: url('/events'),
      paused: !visible,
      onFrame: (event) => {
        if (started === generation) frame(event);
      },
      onState: ({ state: next, err }) => {
        if (started !== generation || !visible) return;
        if (next === 'open') {
          resetLoss();
          state.value = 'online';
        } else if (next === 'denied' || next === 'gone') {
          resetLoss();
          state.value = 'reconnecting';
          if (next === 'denied') {
            authorizationDenied.value = true;
            emit('connection.denied');
          } else protocolError.value ??= err;
        } else if (next === 'connecting' || next === 'reconnecting') {
          if (state.value === 'online') {
            resetLoss();
            state.value = 'reconnecting';
          }
          if (err) failures++;
          reportIfDisconnected();
        }
      },
    });
  }
  function stop() {
    generation++;
    connection?.close();
    connection = undefined;
    sessions.clear();
    resetLoss();
    state.value = 'reconnecting';
    authorizationDenied.value = false;
    snapshotRevision.value = 0;
    protocolError.value = null;
  }
  function setVisible(next: boolean) {
    if (visible === next) return;
    visible = next;
    resetLoss();
    if (!visible) {
      connection?.pause();
      sessions.clear();
      state.value = 'reconnecting';
    }
  }
  function reconnectNow() {
    if (visible) connection?.reconnectNow();
  }
  return { state, authorizationDenied, snapshotRevision, protocolError, start, stop, setVisible, reconnectNow };
}
export const sync = createSync();
