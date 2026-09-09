// Control-plane sync slice: ONE /sync/events SSE connection maintained for
// the app's lifetime. Applies sync.snapshot / sync.update / sync.runtime
// per ui-integration.md and republishes coarse bus events that feature
// slices subscribe to ("refetch linked resource" invalidation model).
// The stream never carries conversation bodies — history stays on /history.
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { shallowRef } from 'vue';
import { createSse } from '../api/sse.js';
import { get, absUrl } from '../api/client.js';

export const sync = (() => {
  const state = shallowRef('closed');        // closed|connecting|open|reconnecting
  const sseId = shallowRef('');              // durable replay cursor
  const snapshotRevision = shallowRef(0);
  const online = shallowRef(true);
  const resetReason = shallowRef(null);      // cursor_ahead | cursor_gap | null

  let sse = null;
  let pollTimer = null;
  let curSessionSubs = new Set();

  const protocolError = shallowRef(null);

  function handleFrame(frame) {
    if (frame.id) sseId.value = frame.id;
    let payload = null;
    if (frame.data) {
      try { payload = JSON.parse(frame.data); }
      catch (err) {
        // Malformed control-plane frame: record it and STOP processing the
        // frame — never guess at a partial payload (round-4 #6).
        protocolError.value = err;
        return;
      }
    }
    switch (frame.event) {
      case 'sync.snapshot':
        if (payload?.reset_reason) resetReason.value = payload.reset_reason;
        snapshotRevision.value += 1;
        // snapshot.sessions is a Page envelope {items,has_more,next_cursor};
        // only .items is ever read — a bare array here is a protocol
        // violation, not something to guess around (round-4 #6).
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

  function startPollFallback() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (state.value === 'open') return;
      try {
        const st = await get('/status');
        online.value = true;
        bus.emit('poll.status', st);
      } catch { online.value = false; }
    }, cfg.sync.pollFallbackMs);
  }

  return {
    state, sseId, online, snapshotRevision, resetReason, protocolError,
    start() {
      if (sse) return;
      sse = createSse({
        url: absUrl('/sync/events'),   // honors setBaseUrl (shells/Node)
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
        // Authoritative reset (reconnect, cursor_gap/ahead) or poll-fallback
        // recovery: linked views must re-read from the source of truth.
        bus.on('sync.snapshot', () => fn({ kind: 'snapshot' })),
        bus.on('poll.status', () => fn({ kind: 'invalidate' })),
      ];
      const off = () => { offs.forEach((o) => o()); curSessionSubs.delete(off); };
      curSessionSubs.add(off);
      return off;
    },
  };
})();
