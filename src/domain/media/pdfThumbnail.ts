import { pdfPage } from './pdfPages.ts';

// Only a small rendered image crosses the network, never the original PDF.
export const pdfThumbnail = (session: string, blob: string, signal: AbortSignal): Promise<Blob> =>
  pdfPage(session, blob, 1, 384, signal);
