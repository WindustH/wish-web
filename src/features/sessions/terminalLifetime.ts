// Browser ownership is independent of cached views. Hidden terminals pause output
// on capable servers, retaining only control traffic until their view returns.
import { ApiError, authHeaders, absUrl } from '../../core/api/client.ts';
import {
  pauseTerminalOutput,
  terminalSocket,
  type TerminalState,
  type TerminalOutput,
} from '../../core/api/terminal.ts';
interface Owner {
  session: string;
  state: TerminalState;
  url: string;
  headers: Record<string, string>;
  socket?: WebSocket;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  heartbeat?: ReturnType<typeof setInterval>;
  background: boolean;
  offset: number;
  retries: number;
}
const owners = new Map<string, Owner>();
let exited = false;
export const terminalFrontendOpen = () => !exited;
function stopTransport(owner: Owner, preserve?: WebSocket) {
  clearTimeout(owner.timer);
  clearInterval(owner.heartbeat);
  owner.controller?.abort();
  owner.controller = undefined;
  if (owner.socket !== preserve) owner.socket?.close();
  owner.socket = undefined;
}
function closeOnExit(owner: Owner) {
  // keepalive works during pagehide and supports Authorization for direct servers.
  // If delivery fails, the server's disconnect grace period is the fallback.
  void fetch(owner.url, {
    method: 'POST',
    headers: owner.headers,
    body: JSON.stringify({ action: 'leave', id: owner.state.id, force: true }),
    keepalive: true,
  }).catch(() => {});
}
export function rememberTerminal(session: string, state: TerminalState) {
  let owner = owners.get(session);
  if (owner && owner.state.id !== state.id) {
    stopTransport(owner);
    owners.delete(session);
    owner = undefined;
  }
  if (!state.running) {
    if (owner) {
      owners.delete(session);
      stopTransport(owner);
    }
    return;
  }
  if (!owner) {
    owner = {
      session,
      state,
      url: absUrl(`/sessions/${encodeURIComponent(session)}/terminal`),
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      background: false,
      offset: 0,
      retries: 0,
    };
    owners.set(session, owner);
  }
  owner.state = state;
  if (exited) {
    owners.delete(session);
    stopTransport(owner);
    closeOnExit(owner);
  }
}
export function claimTerminal(session: string, id: string, socket: WebSocket) {
  const owner = owners.get(session);
  if (!owner || owner.state.id !== id || exited) {
    socket.close();
    return;
  }
  owner.background = false;
  stopTransport(owner, socket);
  owner.socket = socket;
}
function retained(owner: Owner) {
  return !exited && owners.get(owner.session) === owner && owner.background && owner.state.running;
}
async function connectBackground(owner: Owner) {
  if (!retained(owner)) return;
  const controller = new AbortController();
  owner.controller = controller;
  try {
    const { socket } = await terminalSocket(owner.session, owner.state.id, owner.offset, controller.signal);
    if (!retained(owner) || controller.signal.aborted) {
      socket.close();
      return;
    }
    adopt(owner, socket);
  } catch (cause) {
    if (cause instanceof ApiError && [401, 403, 404, 409].includes(cause.status)) {
      if (owners.get(owner.session) === owner) owners.delete(owner.session);
      stopTransport(owner);
      return;
    }
    if (retained(owner) && !controller.signal.aborted) retry(owner);
  }
}
function retry(owner: Owner) {
  clearTimeout(owner.timer);
  owner.timer = setTimeout(() => void connectBackground(owner), Math.min(10000, 500 * 2 ** owner.retries++));
}
function adopt(owner: Owner, socket: WebSocket) {
  owner.socket = socket;
  let lastPong = performance.now();
  const keepAlive = () => {
    clearInterval(owner.heartbeat);
    pauseTerminalOutput(socket);
    owner.heartbeat = setInterval(() => {
      if (!retained(owner) || owner.socket !== socket) {
        clearInterval(owner.heartbeat);
        return;
      }
      if (performance.now() - lastPong > 45000) {
        socket.close();
        return;
      }
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping', time: performance.now() }));
    }, 15000);
  };
  if (socket.readyState === WebSocket.OPEN) keepAlive();
  socket.onopen = () => {
    if (!retained(owner)) {
      socket.close();
      return;
    }
    owner.retries = 0;
    keepAlive();
  };
  socket.onmessage = (event) => {
    if (exited || owners.get(owner.session) !== owner || !owner.background) return;
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'pong') {
        lastPong = performance.now();
        return;
      }
      if (message.type !== 'output') return;
      const output: TerminalOutput = message.output;
      owner.state = output.terminal;
      owner.offset = output.next_offset;
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ack', offset: owner.offset }));
      if (!owner.state.running && output.eof && !output.data) {
        owners.delete(owner.session);
        stopTransport(owner);
      }
    } catch {
      socket.close();
    }
  };
  socket.onerror = () => {}; // onclose owns bounded reconnect, never input replay.
  socket.onclose = () => {
    clearInterval(owner.heartbeat);
    if (retained(owner) && owner.socket === socket) retry(owner);
  };
}
export function parkTerminal(session: string, state: TerminalState, socket: WebSocket | undefined, offset: number) {
  if (exited) {
    socket?.close();
    return;
  }
  const claimed = owners.get(session);
  // An older view's delayed Start response must not take a newer view's live
  // foreground connection away while that newer view is already using it.
  if (!socket && claimed && !claimed.background && claimed.socket && claimed.socket.readyState < WebSocket.CLOSING)
    return;
  rememberTerminal(session, state);
  const owner = owners.get(session);
  if (!owner || exited) {
    socket?.close();
    return;
  }
  if (owner.background && !socket) return;
  owner.background = true;
  stopTransport(owner, socket);
  owner.offset = offset;
  if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
    adopt(owner, socket);
    // A frame may be waiting for xterm's render callback when the view hides.
    // Release its credit now; the view keeps its rendered cursor for replay.
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ack', offset: owner.offset }));
  } else void connectBackground(owner);
}
function releaseAll() {
  exited = true;
  for (const owner of owners.values()) {
    if (owner.state.running) closeOnExit(owner);
    stopTransport(owner);
  }
  owners.clear();
}
function resume() {
  exited = false;
}
window.addEventListener('pagehide', releaseAll);
window.addEventListener('pageshow', resume);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    releaseAll();
    window.removeEventListener('pagehide', releaseAll);
    window.removeEventListener('pageshow', resume);
  });
