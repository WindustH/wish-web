import type { LibraryBlob } from '../../core/api/types.ts';
import { apiFetch } from '../../core/api/client.ts';
import { blobMetadata, blobUrl } from '../../core/api/endpoints.ts';
import { acquireImageLoad } from '../../core/util/imageLoad.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { createAbortScope } from '../../core/util/abortScope.ts';
import { cfg } from '../../core/config.ts';

const MAX_BYTES = 8192;
export const textThumbnailKey = (session: string, blob: string) =>
  `text-cover:${blobUrl(`${session}/${blob}`)}:${MAX_BYTES}`;

/** A bounded prefix, including when a proxy ignores Range. Linked sources revalidate by version. */
export async function textThumbnail(session: string, blob: LibraryBlob, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const key = textThumbnailKey(session, blob.id),
    cached = previewCache.entry(key);
  if (cached && !blob.linked) return cached.value?.text() ?? '';
  const release = await acquireImageLoad(signal);
  const request = createAbortScope([signal], cfg.api.requestTimeoutMs);
  signal = request.signal;
  try {
    const metadata = blob.linked ? await blobMetadata(`${session}/${blob.id}`, { signal }) : undefined;
    signal.throwIfAborted();
    const ready = previewCache.entry(key);
    if (ready && ready.version === metadata?.version) return ready.value?.text() ?? '';
    let text = '';
    if ((metadata?.byte_count ?? blob.byte_count) > 0) {
      const response = await apiFetch(blobUrl(`${session}/${blob.id}`), {
        signal,
        headers: { Range: `bytes=0-${MAX_BYTES - 1}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing text preview body');
      const bytes = new Uint8Array(MAX_BYTES);
      let length = 0;
      try {
        while (length < MAX_BYTES) {
          signal.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          const prefix = chunk.value.subarray(0, MAX_BYTES - length);
          bytes.set(prefix, length);
          length += prefix.length;
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length), {
        stream: length === MAX_BYTES,
      });
      if (text.includes('\0')) return '';
    }
    signal.throwIfAborted();
    previewCache.set(key, new Blob([text], { type: 'text/plain' }), metadata?.version);
    return text;
  } finally {
    request.dispose();
    release();
  }
}
