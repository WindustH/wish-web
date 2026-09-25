// Browser file adapter: picking via <input>.
import type { PickedFile, PickFilesOptions } from '../index.ts';

export const browserFs = {
  // Metadata is returned before reading bytes so the composer can reject a
  // large file before allocating its buffer. Cancelling does not leave a picker.
  pickFiles({ multiple = false, accept = '' }: PickFilesOptions = {}): Promise<PickedFile[]> {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      // Android Chromium treats octet-stream as unrestricted files, while an
      // empty accept also adds camera/video intents to the system chooser.
      // Keep this platform hint out of other browsers' MIME filters.
      const androidChromium = /Android/i.test(navigator.userAgent) && /Chrome\//.test(navigator.userAgent);
      input.accept = !accept && androidChromium ? 'application/octet-stream' : accept;
      input.hidden = true;
      input.multiple = multiple;
      const finish = (files: PickedFile[]) => { input.remove(); resolve(files); };
      input.addEventListener('cancel', () => finish([]), { once: true });
      input.addEventListener('change', () => finish(Array.from(input.files || [], file => ({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        read: () => file.arrayBuffer(),
      }))), { once: true });
      document.body.append(input);
      input.click();
    });
  },
};
