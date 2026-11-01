import { pdfInfo, pdfPage } from './requests.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { renderPdfPage } from './nativePdf.ts';

export async function pdfThumbnail(session: string, blob: string, signal: AbortSignal): Promise<Blob> {
  const info = await pdfInfo(session, blob, signal);
  const key = `pdf-cover:${session}:${blob}:${info.version}:384`;
  const cached = previewCache.get(key);
  signal.throwIfAborted();
  if (cached) return cached;
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
  previewCache.set(key, cover);
  return cover;
}
