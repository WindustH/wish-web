import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Render only the first page at thumbnail resolution; range reads avoid eagerly
// downloading an entire scanned book. The document/worker is released afterwards.
export async function pdfThumbnail(url: string, signal: AbortSignal): Promise<Blob | null> {
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
  signal.throwIfAborted();
  pdf.GlobalWorkerOptions.workerSrc = workerUrl;
  const resources = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href);
  const request = pdf.getDocument({
    url,
    disableAutoFetch: true,
    disableStream: true,
    useSystemFonts: true,
    cMapUrl: new URL('cmaps/', resources).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', resources).href,
    wasmUrl: new URL('wasm/', resources).href,
  });
  const abort = () => void request.destroy().catch(() => {});
  signal.addEventListener('abort', abort, { once: true });
  try {
    const document = await request.promise;
    signal.throwIfAborted();
    const page = await document.getPage(1);
    signal.throwIfAborted();
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(360 / base.width, 480 / base.height) });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    signal.throwIfAborted();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    signal.removeEventListener('abort', abort);
    await request.destroy().catch(() => {});
  }
}
