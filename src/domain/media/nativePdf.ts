import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RenderTask, TextLayer } from 'pdfjs-dist';

// The server returns a standalone, one-page PDF. PDF.js never receives the original
// document URL, so it cannot turn a range request into a whole-book download.
export async function renderPdfPage(bytes: Blob, width: number, signal: AbortSignal, text = false) {
  signal.throwIfAborted();
  const pdfjs = await import('pdfjs-dist');
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await bytes.arrayBuffer());
  signal.throwIfAborted();
  const task = pdfjs.getDocument({
    data,
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    enableXfa: false,
  });
  let retained = false;
  let render: RenderTask | undefined;
  let layer: TextLayer | undefined;
  const cancel = () => {
    render?.cancel();
    layer?.cancel();
    void task.destroy().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const document = await task.promise;
    const page = await document.getPage(1);
    signal.throwIfAborted();
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / original.width });
    // Bound canvas memory independently of CSS zoom / display density.
    const ratio = Math.min(devicePixelRatio || 1, 4096 / Math.max(viewport.width, viewport.height));
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width * ratio));
    canvas.height = Math.max(1, Math.ceil(viewport.height * ratio));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    render = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
    await render.promise;
    signal.throwIfAborted();
    const surface = window.document.createElement('div');
    surface.className = 'native-pdf-page';
    surface.style.width = `${viewport.width}px`;
    surface.style.height = `${viewport.height}px`;
    surface.style.setProperty('--total-scale-factor', String(viewport.scale));
    surface.append(canvas);
    if (text) {
      const container = window.document.createElement('div');
      container.className = 'textLayer';
      surface.append(container);
      layer = new pdfjs.TextLayer({ textContentSource: await page.getTextContent(), container, viewport });
      await layer.render();
      signal.throwIfAborted();
    }
    retained = text;
    return {
      surface,
      canvas,
      dimensions: { width: original.width, height: original.height },
      dispose: () => task.destroy().catch(() => {}),
    };
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!retained) await task.destroy();
  }
}
