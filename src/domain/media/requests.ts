// Cache policy for media consumers; raw API endpoints can always bypass it.
import { blobUrl, pdfPage as fetchPdfPage, mediaPlayback as fetchPlayback } from '../../core/api/endpoints.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { peekCached, writeCached } from '../../core/util/responseCache.ts';
export { pdfInfo, type PdfInfo } from '../../core/api/endpoints.ts';
export async function pdfPage(
  session: string,
  blob: string,
  page: number,
  signal: AbortSignal,
  version: string,
): Promise<Blob> {
  signal.throwIfAborted();
  const key = `${blobUrl(`${session}/${blob}`)}/pdf/page?page=${page}:${version}`;
  const cached = previewCache.get(key);
  if (cached) return cached;
  const bytes = await fetchPdfPage(session, blob, page, signal);
  signal.throwIfAborted();
  previewCache.set(key, bytes);
  return bytes;
}
export async function mediaPlayback(
  session: string,
  blob: string,
  opts?: Parameters<typeof fetchPlayback>[2],
  version = '',
) {
  opts?.signal?.throwIfAborted();
  const key = `playback:${session}/${blob}:${version}`;
  const cached = peekCached<{ path: string; expires_at: number }>(key);
  if (cached && cached.expires_at > Date.now() / 1000 + 60) return cached;
  const grant = await fetchPlayback(session, blob, opts);
  opts?.signal?.throwIfAborted();
  writeCached(key, grant, { persist: false });
  return grant;
}
