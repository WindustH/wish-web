// Control-plane sync slice: ONE /sync/events SSE connection maintained for
// the app's lifetime. Applies sync.snapshot / sync.update / sync.runtime
// per ui-integration.md and republishes coarse bus events that feature
// slices subscribe to ("refetch linked resource" invalidation model).
// The stream never carries conversation bodies — history stays on /history.
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { signal } from './reactive.js';
import { createSse } from '../api/sse.js';
import { get } from '../api/client.js';

export const sync = (() => {
  const state = signal('closed');        // closed|connecting|open|reconnecting
  const sseId = signal('');              // durable replay cursor
  const snapshotRevision = signal(0);
  const storageStates = signal({});      // session id → storage_state
  const online = signal(true);
  const resetReason = signal(null);      // cursor_ahead | cursor_gap | null

  let sse = null;
  let pollTimer = null;
  let curSessionSubs = new Set();

  function handleFrame(frame) {
    if (frame.id) sseId.value = frame.id;
    let payload = null;
    try { payload = frame.data ? JSON.parse(frame.data) : null; } catch { payload = null; }
    switch (frame.event) {
      case 'sync.snapshot':
        if (payload?.reset_reason) resetReason.value = payload.reset_reason;
        snapshotRevision.value += 1;
        applyStorageList(payload?.sessions);
        online.value = true;
        bus.emit('sync.snapshot', payload);
        break;
      case 'sync.update': {
        online.value = true;
        const upserts = payload?.upserts || [];
        const tombs = payload?.tombstones || [];
        const invs = payload?.invalidations || [];
        for (const u of upserts) bus.emit(`upsert.${u.resource}`, u);
        for (const t of tombs) bus.emit(`tombstone.${t.resource}`, t);
        for (const i of invs) bus.emit(`invalidate.${i.resource}`, i);
        bus.emit('sync.update', payload);
        break;
      }
      case 'sync.runtime':
        applyStorageList(payload?.sessions);
        bus.emit('sync.runtime', payload);
        break;
      case 'sync.heartbeat':
        online.value = true;
        break;
      case 'sync.error':
        online.value = false;
        break;
      default:
        break;
    }
  }

  function applyStorageList(list) {
    if (!Array.isArray(list)) return;
    const map = { ...storageStates.peek() };
    for (const s of list) if (s?.id) map[s.id] = s.storage_state;
    storageStates.value = map;
  }

  function startPollFallback() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (state.peek() === 'open') return;
      try {
        const st = await get('/status');
        online.value = true;
        bus.emit('poll.status', st);
      } catch { online.value = false; }
    }, cfg.sync.pollFallbackMs);
  }

  return {
    state, sseId, storageStates, online, snapshotRevision, resetReason,
    start() {
      if (sse) return;
      sse = createSse({
        url: `${cfg.api.baseUrl}/sync/events`,
        onFrame: handleFrame,
      });
      sse.onState(({ state: s }) => { state.value = s; });
      startPollFallback();
    },
    stop() {
      sse?.close(); sse = null;
      clearInterval(pollTimer); pollTimer = null;
      state.value = 'closed';
    },
    // subscribeSession(id, fn): get upsert/invalidate events for one session
    subscribeSession(id, fn) {
      const offs = [
        bus.on('upsert.session', (u) => { if (u.id === id) fn({ kind: 'upsert', body: u.body ?? u }); }),
        bus.on('invalidate.session', (i) => { if (!i.id || i.id === id) fn({ kind: 'invalidate' }); }),
        bus.on('tombstone.session', (t) => { if (t.id === id) fn({ kind: 'tombstone' }); }),
      ];
      const off = () => { offs.forEach((o) => o()); curSessionSubs.delete(off); };
      curSessionSubs.add(off);
      return off;
    },
  };
})();
