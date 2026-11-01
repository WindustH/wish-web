import { pdfInfo, pdfPage } from '../../core/api/endpoints.ts';

// Metadata validates linked sources; cache keys include source version and resolution.
export async function pdfThumbnail(session: string, blob: string, signal: AbortSignal): Promise<Blob> {
  const info = await pdfInfo(session, blob, signal);
  return pdfPage(session, blob, 1, 384, signal, info.version);
}
