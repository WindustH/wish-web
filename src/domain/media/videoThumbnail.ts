// Called under the shared thumbnail permit. The decoder is released as soon as
// one bounded frame has been copied, rather than retained by every grid card.
export async function videoThumbnail(src: string, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    return await new Promise<Blob>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(new Error('Video thumbnail timed out')), 15_000);
      video.onerror = () => reject(new Error('Video thumbnail unavailable'));
      video.onloadeddata = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.min(0.1, video.duration / 2);
          if (!video.seeking) capture();
        } else capture();
      };
      let capturing = false;
      const capture = () => {
        if (signal.aborted || capturing) return;
        capturing = true;
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 384 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        try {
          canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Video thumbnail unavailable'))),
            'image/webp',
            0.8,
          );
        } catch (error) {
          reject(error);
        }
      };
      video.onseeked = capture;
      video.src = src;
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    video.onloadeddata = video.onseeked = video.onerror = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
