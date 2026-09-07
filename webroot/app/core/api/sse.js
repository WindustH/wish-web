// SSE client over fetch (EventSource cannot send Last-Event-ID reliably
// across proxies and gives no status codes). Features: automatic reconnect
// with exponential backoff + jitter, heartbeat timeout detection,
// Last-Event-ID resume, frame callback {event, id, data, retry}.
// DOM-free: uses fetch/AbortController only.
import { cfg } from '../config.js';

export function createSse({ url, onFrame, onState, firstTimeoutMs }) {
  const stateListeners = new Set();
  let lastEventId = '';
  let attempt = 0;
  let aborted = false;
  let controller = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let closed = false;

  const emitState = (s, err) => {
    for (const fn of stateListeners) fn({ state: s, attempt, err, lastEventId });
  };

  function scheduleReconnect(err) {
    if (aborted || closed) return;
    const base = Math.min(cfg.sse.reconnectBaseMs * 2 ** attempt, cfg.sse.reconnectMaxMs);
    const delay = base / 2 + Math.random() * (base / 2);
    attempt += 1;
    emitState('reconnecting', err);
    reconnectTimer = setTimeout(connect, delay);
  }

  function armHeartbeat() {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      // Silent for too long — treat as dead connection.
      controller?.abort();
    }, cfg.sse.heartbeatTimeoutMs);
  }

  async function connect() {
    if (aborted || closed) return;
    controller = new AbortController();
    const headers = { accept: 'text/event-stream' };
    if (lastEventId) headers['last-event-id'] = lastEventId;
    emitState(attempt ? 'reconnecting' : 'connecting');
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok || !res.body) throw Object.assign(new Error(`SSE ${res.status}`), { status: res.status });
      attempt = 0;
      emitState('open');
      armHeartbeat();

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let firstFrameSeen = !firstTimeoutMs;

      pump: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const frame = parseFrame(chunk);
          if (!frame) continue;
          firstFrameSeen = true;
          if (frame.id) lastEventId = frame.id;
          if (frame.retry) { /* advisory only */ }
          armHeartbeat();
          onFrame?.(frame);
        }
        void firstFrameSeen;
      }
      // Server closed the stream cleanly: reconnect (durable tails end).
      scheduleReconnect(new Error('stream ended'));
    } catch (err) {
      if (err?.name === 'AbortError' && aborted) return;
      scheduleReconnect(err);
    }
  }

  connect();

  return {
    onState(fn) { stateListeners.add(fn); return () => stateListeners.delete(fn); },
    close() {
      closed = true;
      aborted = true;
      clearTimeout(reconnectTimer);
      clearTimeout(heartbeatTimer);
      controller?.abort();
      emitState('closed');
    },
    getLastEventId: () => lastEventId,
  };
}

function parseFrame(chunk) {
  let event = 'message', dataLines = [], id = '', retry = 0, sawData = false;
  for (const rawLine of chunk.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') { dataLines.push(value); sawData = true; }
    else if (field === 'id') id = value;
    else if (field === 'retry') retry = Number(value) || 0;
  }
  if (!sawData && event === 'message' && !id) return null; // keepalive
  return { event, id, data: dataLines.join('\n'), retry };
}
