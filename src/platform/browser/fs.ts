// Browser file adapter: picking via <input>.
import type { PickedFile, PickFilesOptions } from '../index.ts';

export const browserFs = {
  // Metadata is returned before reading bytes so the composer can reject a
  // large file before allocating its buffer. Cancelling does not leave a picker.
  pickFiles({ multiple = false, accept = '' }: PickFilesOptions = {}): Promise<PickedFile[]> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      // Android Chromium treats octet-stream as unrestricted files, while an
      // empty accept also adds camera/video intents to the system chooser.
      // Keep this platform hint out of other browsers' MIME filters.
      const androidChromium = /Android/i.test(navigator.userAgent) && /Chrome\//.test(navigator.userAgent);
      input.accept = !accept && androidChromium ? 'application/octet-stream' : accept;
      input.hidden = true;
      input.multiple = multiple;
      let finished = false;
      let fallback: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(fallback);
        window.removeEventListener('focus', returned);
        document.removeEventListener('visibilitychange', returned);
        input.remove();
      };
      const finish = (files: PickedFile[]) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(files);
      };
      const selected = () =>
        Array.from(input.files || [], (file) => ({
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          body: file,
          read: () => file.arrayBuffer(),
        }));
      // Older WebViews omit cancel. Give change a chance to arrive after the
      // native picker returns focus before resolving an empty selection.
      function returned() {
        if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
        clearTimeout(fallback);
        fallback = setTimeout(() => finish(selected()), 500);
      }
      input.addEventListener('cancel', () => finish([]), { once: true });
      input.addEventListener('change', () => finish(selected()), { once: true });
      window.addEventListener('focus', returned);
      document.addEventListener('visibilitychange', returned);
      document.body.append(input);
      try {
        input.click();
      } catch (error) {
        finished = true;
        cleanup();
        reject(error);
      }
    });
  },
};
