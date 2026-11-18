import { post } from './client.ts';

export interface TerminalState {
  id: string;
  running: boolean;
  exit_code: number | null;
  error: string | null;
  cols: number;
  rows: number;
  cwd: string;
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
  request<{ terminal: TerminalState | null }>(session, { action: 'state' }, signal);
export const startTerminal = (session: string, cols: number, rows: number, signal?: AbortSignal) =>
  request<{ terminal: TerminalState }>(session, { action: 'start', cols, rows }, signal);
export const pollTerminal = (session: string, id: string, offset: number, signal?: AbortSignal) =>
  request<TerminalOutput>(session, { action: 'poll', id, offset }, signal);
export const writeTerminal = (session: string, id: string, bytes: Uint8Array, signal?: AbortSignal) =>
  request(session, { action: 'write', id, data: btoa(String.fromCharCode(...bytes)) }, signal);
export const resizeTerminal = (session: string, id: string, cols: number, rows: number, signal?: AbortSignal) =>
  request(session, { action: 'resize', id, cols, rows }, signal);
export const closeTerminal = (session: string, id: string, signal?: AbortSignal) =>
  request<{ terminal: TerminalState }>(session, { action: 'close', id }, signal);
