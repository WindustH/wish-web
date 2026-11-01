import { apiFetch, get } from '../../core/api/client.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import { createAbortScope } from '../../core/util/abortScope.ts';
import { previewCache } from '../../core/util/previewCache.ts';

export interface PdfInfo {
  pages: number;
  version: string;
  bookmarks: { title: string; depth: number; page: number | null }[];
}
export const pdfInfo = (session: string, blob: string, signal: AbortSignal): Promise<PdfInfo> =>
  get(`/sessions/${encodeURIComponent(session)}/blobs/${encodeURIComponent(blob)}/pdf`, { signal, timeoutMs: 60_000 });

export async function pdfPage(
  session: string,
  blob: string,
  page: number,
  width: number,
  signal: AbortSignal,
  version?: string,
): Promise<Blob> {
  const path = `${blobUrl(`${session}/${blob}`)}/pdf/page?page=${page}&width=${width}`;
  const key = `${path}:${version}`;
  signal.throwIfAborted();
  const cached = version === undefined ? undefined : previewCache.get(key);
  if (cached) return cached;
  const scope = createAbortScope([signal], 60_000);
  try {
    const response = await apiFetch(path, { signal: scope.signal });
    if (!response.ok) throw new Error(`PDF preview: HTTP ${response.status}`);
    const bytes = await response.blob();
    scope.signal.throwIfAborted();
    if (version !== undefined) previewCache.set(key, bytes);
    return bytes;
  } finally {
    scope.dispose();
  }
}
