import { shallowRef } from 'vue';
import { bus } from '../bus.ts';
import { createSse, type SseConnection, type SseFrame, type SseState } from '../api/sse.ts';
import { absUrl } from '../api/client.ts';
import { sessionGet } from '../api/endpoints.ts';
import { createKeyedRefresh } from '../util/keyedRefresh.ts';
import type { SessionView } from '../api/projections.ts';

// Bus payloads published by this slice.
export interface SessionUpsert { id: string; body: SessionView }
export interface SessionTombstone { id: string }
export type SessionSyncEvent = { kind: 'upsert'; body: SessionView } | { kind: 'tombstone' } | { kind: 'snapshot' };

export const sync = (() => {
  const state = shallowRef<SseState>('closed');
  const online = shallowRef(true);
  /** Bumped on every sync.snapshot frame; 1 = initial, >1 = reconnect/reset. */
  const snapshotRevision = shallowRef(0);
  const protocolError = shallowRef<unknown>(null);
  let connection: SseConnection | null | undefined;
  const sessions = createKeyedRefresh(
    (id: string, signal: AbortSignal): Promise<SessionView> => sessionGet(id, { signal }),
    (id: string, body: SessionView) => bus.emit('upsert.session', { id, body }),
    (id: string, error: any) => {
      if (error.status === 404) bus.emit('tombstone.session', { id });
      else protocolError.value = error;
    },
  );

  function frame(frame: SseFrame) {
    try {
      const event = JSON.parse(frame.data);
      if (event.type === 'snapshot' || event.type === 'gap') {
        sessions.clear();
        snapshotRevision.value++;
        bus.emit('sync.snapshot', {});
      } else if (event.type === 'configuration_changed') {
        bus.emit('configuration.changed', {});
      } else if (event.type === 'session_deleted') {
        sessions.invalidate(event.id);
        bus.emit('tombstone.session', { id: event.id });
      } else if (event.type === 'session_changed') {
        void sessions.refresh(event.id);
      }
    } catch (error) { protocolError.value = error; }
  }

  function start() {
    if (connection) return;
    connection = createSse({
      url: absUrl('/events'), onFrame: frame,
      onState: ({ state: next }) => { state.value = next; online.value = next === 'open'; },
    });
  }
  function stop() {
    connection?.close(); connection = null;
    sessions.clear();
    state.value = 'closed';
  }
  function subscribeSession(id: string, callback: (event: SessionSyncEvent) => void): () => void {
    const offs = [
      bus.on('upsert.session', (event: SessionUpsert) => { if (event.id === id) callback({ kind: 'upsert', body: event.body }); }),
      bus.on('tombstone.session', (event: SessionTombstone) => { if (event.id === id) callback({ kind: 'tombstone' }); }),
      bus.on('sync.snapshot', () => callback({ kind: 'snapshot' })),
    ];
    return () => offs.forEach(off => off());
  }
  return { state, online, snapshotRevision, protocolError, start, stop, subscribeSession };
})();
