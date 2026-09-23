import { shallowRef } from 'vue';
import { bus } from '../bus.js';
import { createSse } from '../api/sse.js';
import { absUrl } from '../api/client.js';
import { sessionGet } from '../api/endpoints.js';
import { createKeyedRefresh } from '../util/keyedRefresh.js';

export const sync = (() => {
  const state = shallowRef('closed');
  const online = shallowRef(true);
  const snapshotRevision = shallowRef(0);
  const protocolError = shallowRef(null);
  let connection;
  const sessions = createKeyedRefresh(
    (id, signal) => sessionGet(id, { signal }),
    (id, body) => bus.emit('upsert.session', { id, body }),
    (id, error) => {
      if (error.status === 404) bus.emit('tombstone.session', { id });
      else protocolError.value = error;
    },
  );

  function frame(frame) {
    try {
      const event = JSON.parse(frame.data);
      if (event.type === 'snapshot' || event.type === 'gap') {
        sessions.clear();
        snapshotRevision.value++;
        bus.emit('sync.snapshot', {});
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
  function subscribeSession(id, callback) {
    const offs = [
      bus.on('upsert.session', event => { if (event.id === id) callback({ kind: 'upsert', body: event.body }); }),
      bus.on('tombstone.session', event => { if (event.id === id) callback({ kind: 'tombstone' }); }),
      bus.on('sync.snapshot', () => callback({ kind: 'snapshot' })),
    ];
    return () => offs.forEach(off => off());
  }
  return { state, online, snapshotRevision, protocolError, start, stop, subscribeSession };
})();
