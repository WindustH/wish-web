import { pdfInfo, pdfPage } from './requests.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { renderPdfPage } from './nativePdf.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import { acquireImageLoad } from '../../core/util/imageLoad.ts';

export const pdfThumbnailKey = (session: string, blob: string) => `pdf-cover:${blobUrl(`${session}/${blob}`)}:384`;

export async function pdfThumbnail(session: string, blob: string, signal: AbortSignal): Promise<Blob> {
  const key = pdfThumbnailKey(session, blob);
  const info = await pdfInfo(session, blob, signal);
  const cached = previewCache.entry(key);
  signal.throwIfAborted();
  if (cached?.version === info.version && cached.value) return cached.value;
  const release = await acquireImageLoad(signal);
  try {
    // Another surface may have produced this cover while we were waiting for a decoder.
    const ready = previewCache.entry(key);
    if (ready?.version === info.version && ready.value) return ready.value;
    const bytes = await pdfPage(session, blob, 1, signal, info.version);
    const { canvas } = await renderPdfPage(bytes, 384, signal);
    const cover = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PDF thumbnail encoding failed'))),
        'image/webp',
        0.8,
      ),
    );
    signal.throwIfAborted();
    previewCache.set(key, cover, info.version);
    return cover;
  } finally {
    release();
  }
}
