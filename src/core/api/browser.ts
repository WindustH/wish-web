import { absUrl, post } from './client.ts';

export async function browserSocket(session: string, signal: AbortSignal) {
  const path = `/sessions/${encodeURIComponent(session)}/browser`;
  const { ticket }: { ticket: string } = await post(`${path}/connect?target=client`, {}, { signal });
  signal.throwIfAborted();
  const url = new URL(absUrl(`${path}/socket`));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return new WebSocket(url);
}
