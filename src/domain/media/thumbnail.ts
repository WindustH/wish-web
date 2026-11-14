// The last cover can be displayed immediately. Mutable local links are revalidated before decoding.
import type { LibraryBlob } from '../../core/api/types.ts';
import { absUrl } from '../../core/api/client.ts';
import { blobMetadata, blobUrl } from '../../core/api/endpoints.ts';
import { acquireImageLoad } from '../../core/util/imageLoad.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { audioCover } from './audioCover.ts';
import { pdfThumbnail, pdfThumbnailKey } from './pdfThumbnail.ts';
import { mediaPlayback } from './requests.ts';
import { videoThumbnail } from './videoThumbnail.ts';

export function thumbnailKey(session: string, blob: LibraryBlob): string {
  return blob.mime_type === 'application/pdf'
    ? pdfThumbnailKey(session, blob.id)
    : `media-cover:${blobUrl(`${session}/${blob.id}`)}:384`;
}

export async function thumbnail(session: string, blob: LibraryBlob, signal: AbortSignal): Promise<Blob | null> {
  signal.throwIfAborted();
  const key = thumbnailKey(session, blob);
  const cached = previewCache.entry(key);
  if (cached && !blob.linked) return cached.value;
  if (blob.mime_type === 'application/pdf') return pdfThumbnail(session, blob.id, signal);

  // Library modified_at dates the link's registration, not its current target contents.
  const metadata = blob.linked ? await blobMetadata(`${session}/${blob.id}`, { signal }) : undefined;
  signal.throwIfAborted();
  const version = metadata?.version;
  if (cached && cached.version === version) return cached.value;
  const release = await acquireImageLoad(signal);
  try {
    const ready = previewCache.entry(key);
    if (ready && ready.version === version) return ready.value;
    const cover = blob.mime_type.startsWith('audio/')
      ? await audioCover(
          blobUrl(`${session}/${blob.id}`),
          metadata?.byte_count ?? blob.byte_count,
          metadata?.mime_type ?? blob.mime_type,
          signal,
        )
      : await videoThumbnail(absUrl((await mediaPlayback(session, blob.id, { signal }, version)).path), signal);
    signal.throwIfAborted();
    previewCache.set(key, cover, version);
    return cover;
  } finally {
    release();
  }
}
