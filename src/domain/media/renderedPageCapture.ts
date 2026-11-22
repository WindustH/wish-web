import { tr } from '../../core/i18n/tr.ts';
import { createAbortScope } from '../../core/util/abortScope.ts';

const restriction = (globalThis as { RestrictionTarget?: { fromElement(element: Element): Promise<object> } })
  .RestrictionTarget;

export function canCaptureRenderedPage() {
  return (
    !!restriction &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    'requestVideoFrameCallback' in HTMLVideoElement.prototype
  );
}

// A browser permission prompt can outlive a closed preview. Stop any stream that arrives late.
function untilAborted<T>(operation: Promise<T>, signal: AbortSignal, discard?: (value: T) => void) {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) discard?.(value);
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

export async function captureRenderedPage(frame: HTMLIFrameElement, signal: AbortSignal) {
  if (!restriction) throw new Error('Element Capture is unavailable');
  signal.throwIfAborted();
  // This must run within the pointer-release gesture. The user chooses the source.
  const options = {
    video: true,
    audio: false,
    preferCurrentTab: true,
    monitorTypeSurfaces: 'exclude',
    surfaceSwitching: 'exclude',
  };
  const stream = await untilAborted(navigator.mediaDevices.getDisplayMedia(options), signal, stopStream);
  const scope = createAbortScope([signal], 8000);
  const video = document.createElement('video');
  let callback = 0;
  try {
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
      restrictTo?: (target: object) => Promise<void>;
    };
    const target = await untilAborted(restriction.fromElement(frame), scope.signal);
    // Never read frames until the browser has restricted the track to this preview.
    if (!track?.restrictTo) throw new Error(tr('请选择当前 Wish 标签页', 'Share this Wish tab'));
    await untilAborted(track.restrictTo(target), scope.signal).catch((error) => {
      scope.signal.throwIfAborted();
      if (error instanceof DOMException) throw new Error(tr('请选择当前 Wish 标签页', 'Share this Wish tab'));
      throw error;
    });
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    // Keep the decoder attached until it supplies a frame. Browsers can abort
    // playback on a detached video while the tab is returning from the chooser.
    video.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.append(video);
    video.srcObject = stream;
    await untilAborted(video.play(), scope.signal);
    await untilAborted(
      new Promise<void>((resolve) => {
        callback = video.requestVideoFrameCallback(() => resolve());
      }),
      scope.signal,
    );
    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) throw new Error('Page frame is unavailable');
    const scale = Math.min(1, 2048 / Math.max(videoWidth, videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(videoWidth * scale));
    canvas.height = Math.max(1, Math.round(videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (error) {
    if (scope.timedOut) throw new Error(tr('页面截取超时', 'Page capture timed out'));
    throw error;
  } finally {
    scope.dispose();
    if (callback) video.cancelVideoFrameCallback(callback);
    video.srcObject = null;
    video.remove();
    stopStream(stream);
  }
}
