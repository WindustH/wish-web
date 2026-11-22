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
  connect?: (options: SseOptions) => Pick<SseConnection, 'close'>;
  readSession?: (id: string, signal: AbortSignal) => Promise<SessionView>;
  url?: (path: string) => string;
  emit?: typeof bus.emit;
}
export function createSync({
  connect = createSse,
  readSession = (id, signal) => sessionGet(id, { signal }),
  url = absUrl,
  emit = bus.emit,
}: SyncDependencies = {}) {
  const online = shallowRef(true);
  /** Bumped on every sync.snapshot frame; 1 = initial, >1 = reconnect/reset. */
  const snapshotRevision = shallowRef(0);
  // Report each failure category once per signed-in sync lifecycle. Background
  // invalidations can arrive for many sessions during a single outage.
  const protocolError = shallowRef<unknown>(null);
  const refreshError = shallowRef<unknown>(null);
  let connection: Pick<SseConnection, 'close'> | undefined;
  let generation = 0;
  const sessions = createKeyedRefresh(
    (id: string, signal: AbortSignal): Promise<SessionView> => readSession(id, signal),
    (id: string, body: SessionView) => emit('upsert.session', { id, body }),
    (id: string, error: unknown) => {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404)
        emit('tombstone.session', { id });
      else refreshError.value ??= error;
    },
  );

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
    connection = connect({
      url: url('/events'),
      onFrame: (event) => {
        if (started === generation) frame(event);
      },
      onState: ({ state: next }) => {
        if (started === generation) online.value = next === 'open';
      },
    });
  }
  function stop() {
    generation++;
    connection?.close();
    connection = undefined;
    sessions.clear();
    online.value = false;
    snapshotRevision.value = 0;
    protocolError.value = null;
    refreshError.value = null;
  }
  return { online, snapshotRevision, protocolError, refreshError, start, stop };
}
export const sync = createSync();
