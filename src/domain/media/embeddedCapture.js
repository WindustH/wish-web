// Self-contained HTML documents have an opaque origin. Let the document capture
// its own viewport, replying only over the one-shot channel supplied by its parent.
(() => {
  // WebGL may discard the displayed buffer after compositing, even when the
  // scene is paused. HTML previews need the last drawn frame for a later quote.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    return Reflect.apply(getContext, this, [
      type,
      /^(webgl2?|experimental-webgl)$/.test(type) ? { ...options, preserveDrawingBuffer: true } : options,
    ]);
  };
  addEventListener('message', async (event) => {
    const port = event.ports[0];
    if (event.source !== parent || event.data?.type !== 'wish-capture' || !port) return;
    try {
      // The parent supplies its bundled renderer on demand to avoid adding it to every HTML file.
      if (!('htmlToImage' in window)) {
        const script = document.createElement('script');
        script.textContent = event.data.renderer;
        document.head.append(script);
        script.remove();
      }
      await new Promise(requestAnimationFrame);
      const renderer = window.htmlToImage;
      const blob = await renderer.toBlob(document.documentElement, {
        width: innerWidth,
        height: innerHeight,
        pixelRatio: Math.min(devicePixelRatio, 2048 / Math.max(innerWidth, innerHeight)),
        style: { transform: `translate(${-scrollX}px, ${-scrollY}px)` },
        filter: (node) =>
          !(
            node instanceof Element &&
            (['HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName) ||
              getComputedStyle(node).display === 'none')
          ),
      });
      port.postMessage(blob);
      port.close();
    } catch (e) {
      port.postMessage({ error: String(e) });
      port.close();
    }
  });
})();
