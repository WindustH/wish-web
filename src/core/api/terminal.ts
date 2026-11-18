import type { TerminalSettings } from '../configTypes.ts';
import { post, absUrl } from './client.ts';

export interface TerminalState {
  id: string;
  running: boolean;
  exit_code: number | null;
  error: string | null;
  cols: number;
  rows: number;
  cwd: string;
  persistent: boolean;
  busy: boolean;
}
export interface TerminalOutput {
  terminal: TerminalState;
  data: string;
  next_offset: number;
  reset: boolean;
  eof: boolean;
}
const request = <T>(session: string, body: object, signal?: AbortSignal): Promise<T> =>
  post(`/sessions/${encodeURIComponent(session)}/terminal`, body, { signal, timeoutMs: 25000 });
export const terminalState = (session: string, signal?: AbortSignal) =>
  request<{ terminal: TerminalState | null; settings: TerminalSettings }>(session, { action: 'state' }, signal);
export const startTerminal = (session: string, cols: number, rows: number, signal?: AbortSignal) =>
  request<{ terminal: TerminalState; settings: TerminalSettings }>(session, { action: 'start', cols, rows }, signal);
export const pollTerminal = (session: string, id: string, offset: number, signal?: AbortSignal) =>
  request<TerminalOutput>(session, { action: 'poll', id, offset }, signal);
export const writeTerminal = (session: string, id: string, bytes: Uint8Array, signal?: AbortSignal) =>
  request(session, { action: 'write', id, data: encodeBytes(bytes) }, signal);
export const resizeTerminal = (session: string, id: string, cols: number, rows: number, signal?: AbortSignal) =>
  request(session, { action: 'resize', id, cols, rows }, signal);
export const closeTerminal = (session: string, id: string, signal?: AbortSignal) =>
  request<{ terminal: TerminalState; settings: TerminalSettings }>(session, { action: 'close', id }, signal);

export const leaveTerminal = (session: string, id: string, force = false) =>
  request<{ confirmation_required: boolean; terminal: TerminalState }>(session, { action: 'leave', id, force });
const pausableSockets = new WeakSet<WebSocket>();
export function pauseTerminalOutput(socket: WebSocket) {
  if (pausableSockets.has(socket) && socket.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: 'pause', paused: true }));
}
export async function terminalSocket(session: string, id: string, offset: number, signal: AbortSignal) {
  const { ticket, replay_until, pause_output }: { ticket: string; replay_until: number; pause_output?: boolean } =
    await post(`/sessions/${encodeURIComponent(session)}/terminal/connect`, { id }, { signal });
  if (!Number.isSafeInteger(replay_until) || replay_until < 0)
    throw new Error('The Wish server needs an update to restore terminals safely.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const url = new URL(absUrl(`/sessions/${encodeURIComponent(session)}/terminal/socket`));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  url.searchParams.set('offset', String(offset));
  const socket = new WebSocket(url);
  if (pause_output) pausableSockets.add(socket);
  return { socket, replayUntil: replay_until };
}

function encodeBytes(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(''));
}
