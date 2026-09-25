// SSE client over fetch (EventSource cannot send Last-Event-ID reliably
// across proxies and gives no status codes). Features: automatic reconnect
// with exponential backoff + jitter, heartbeat timeout detection (ANY
// received bytes — frames, partial frames or comment keepalives — count as
// liveness), Last-Event-ID resume, connect timeout, and terminal handling
// of 401/403/404/410 (auth failure / resource gone) which must NOT loop.
// DOM-free: fetch/AbortController only; callers pass an absolute URL in
// non-browser hosts (see client.js absUrl()).
import { cfg } from '../config.js';
import { authHeaders } from './client.js';

const GONE_STATUSES = new Set([404, 410]);      // resource no longer exists
const DENIED_STATUSES = new Set([401, 403]);    // auth failure — never retried
const MAX_FRAME_CHARS = 16 * 1024 * 1024;

export function createSse({ url, onFrame, onState, firstTimeoutMs, headers: extraHeaders }) {
  const stateListeners = new Set();
  if (onState) stateListeners.add(onState);   // constructor-level listener
  let lastEventId = '';
  let attempt = 0;
  let aborted = false;        // user-initiated close
  let terminal = false;       // gone/denied — never reconnect
  let controller = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let connectTimer = null;

  const emitState = (s, err) => {
    for (const fn of stateListeners) fn({ state: s, attempt, err, lastEventId });
  };

  function clearTimers() {
    clearTimeout(reconnectTimer); reconnectTimer = null;
    clearTimeout(heartbeatTimer); heartbeatTimer = null;
    clearTimeout(connectTimer); connectTimer = null;
  }

  function scheduleReconnect(err) {
    if (aborted || terminal) return;
    const base = Math.min(cfg.sse.reconnectBaseMs * 2 ** attempt, cfg.sse.reconnectMaxMs);
    const delay = base / 2 + Math.random() * (base / 2);
    attempt += 1;
    emitState('reconnecting', err);
    reconnectTimer = setTimeout(connect, delay);
  }

  // Liveness = any bytes within heartbeatTimeoutMs. Comment keepalives
  // (": ping") parse to no frame but DO reset this timer (task 3).
  function armHeartbeat() {
    if (aborted || terminal) return;
    clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => controller?.abort(new Error('heartbeat timeout')), cfg.sse.heartbeatTimeoutMs);
  }

  async function connect() {
    if (aborted || terminal) return;
    controller = new AbortController();
    const headers = { accept: 'text/event-stream', ...authHeaders(), ...(extraHeaders || {}) };
    if (lastEventId) headers['last-event-id'] = lastEventId;
    emitState(attempt ? 'reconnecting' : 'connecting');
    // Connect timeout: headers must arrive within this window or we abort
    // and retry (covers black-holed connections, not just refused ones).
    const connectDeadline = firstTimeoutMs ?? cfg.sse.connectTimeoutMs;
    connectTimer = setTimeout(
      () => controller.abort(new Error('connect timeout')),
      connectDeadline,
    );
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(connectTimer);
      if (GONE_STATUSES.has(res.status) || DENIED_STATUSES.has(res.status)) {
        // The stream resource is gone (404/410) or auth failed (401/403).
        // Reconnecting forever would be dishonest — surface the terminal
        // state ('gone' vs 'denied') and stop.
        terminal = true;
        const state = DENIED_STATUSES.has(res.status) ? 'denied' : 'gone';
        emitState(state, Object.assign(new Error(`SSE ${res.status}`), { status: res.status }));
        return;
      }
      if (res.status === 409) {
        const problem = await res.json();
        if (problem.title === 'run_not_streaming') {
          terminal = true;
          emitState('disabled');
          return;
        }
      }
      if (!res.ok || !res.body) throw Object.assign(new Error(`SSE ${res.status}`), { status: res.status });
      attempt = 0;
      emitState('open');
      armHeartbeat();

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        armHeartbeat();                        // bytes = alive (frames, partials, comments)
        buf += dec.decode(value, { stream: true });
        // Incremental CRLF handling: a lone trailing CR is AMBIGUOUS — it
        // may be the first half of a CRLF split across network chunks. Only
        // complete CR sequences are normalized; the trailing CR is held
        // back until the next chunk disambiguates it (review #3).
        let heldCr = false;
        if (buf.endsWith('\r')) { buf = buf.slice(0, -1); heldCr = true; }
        buf = buf.replace(/\r\n?/g, '\n');
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const frame = parseFrame(chunk);
          if (!frame) continue;                // keepalive comment / blank
          if (frame.id) lastEventId = frame.id;
          if (frame.retry) { /* advisory only */ }
          if (!aborted && !terminal) onFrame?.(frame);
        }
        if (heldCr) buf += '\r';
        // A stream that keeps sending bytes but never a blank-line frame
        // boundary would grow `buf` without limit; treat it as a broken
        // connection and reconnect instead of buffering forever.
        if (buf.length > MAX_FRAME_CHARS) throw new Error('SSE frame exceeded 16MiB');
        if (aborted || terminal) { reader.cancel().catch(() => {}); return; }
      }
      if (aborted || terminal) return;
      // Server closed the stream cleanly: reconnect (durable tails end).
      scheduleReconnect(new Error('stream ended'));
    } catch (err) {
      clearTimeout(connectTimer);
      if (aborted) return;                     // close(): zero callbacks after
      if (terminal) return;
      scheduleReconnect(err);
    }
  }

  connect();

  return {
    onState(fn) { stateListeners.add(fn); return () => stateListeners.delete(fn); },
    close() {
      aborted = true;
      clearTimers();
      controller?.abort(new Error('closed'));
      emitState('closed');
    },
    getLastEventId: () => lastEventId,
    isTerminal: () => terminal,
  };
}

function parseFrame(chunk) {
  let event = 'message', dataLines = [], id = '', retry = 0, sawData = false;
  for (const rawLine of chunk.split('\n')) {
    const line = rawLine;
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
