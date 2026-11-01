// Limit authenticated image downloads across all open detail surfaces.
let active = 0;
const waiting = new Set<() => void>();
export function acquireImageLoad(signal: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      waiting.delete(start);
      reject(signal.reason);
    };
    const start = () => {
      if (signal.aborted) {
        abort();
        return;
      }
      if (active >= 4) {
        waiting.add(start);
        return;
      }
      waiting.delete(start);
      signal.removeEventListener('abort', abort);
      active++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active--;
        for (const next of waiting) {
          if (active >= 4) break;
          next();
        }
      });
    };
    signal.addEventListener('abort', abort, { once: true });
    start();
  });
}
