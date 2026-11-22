export async function capturePage(frame: HTMLIFrameElement, embedded: boolean, signal: AbortSignal): Promise<Blob> {
  const renderer = embedded ? (await import('html-to-image/dist/html-to-image.js?raw')).default : undefined;
  signal.throwIfAborted();
  const guest = frame.contentWindow;
  if (!guest) throw new Error('Page is unavailable');
  const channel = new MessageChannel();
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const exit = () => reject(signal.reason);
      signal.addEventListener('abort', exit, { once: true });
      channel.port1.onmessage = ({ data }) => {
        signal.removeEventListener('abort', exit);
        if (data instanceof Blob && data.type === 'image/png' && data.size > 0 && data.size <= 24 * 1024 * 1024)
          resolve(data);
        else reject(new Error(data?.error || 'Page capture failed'));
      };
      guest.postMessage({ type: 'wish-capture', renderer }, embedded ? '*' : new URL(frame.src).origin, [
        channel.port2,
      ]);
    });
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
}
