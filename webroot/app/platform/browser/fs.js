// Browser file adapter: saving via anchor download, picking via <input>.
import { cfg } from '../../core/config.js';

export const browserFs = {
  async saveFile({ name, mime, bytes }) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'wish-export';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  },

  // Resolves [{ name, mime, bytes }] — upload to wishd happens in the chat
  // slice via endpoints.uploadSessionImage.
  pickImages({ multiple = false } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = multiple && cfg.composer.maxImages > 1;
      input.onchange = async () => {
        const files = [...(input.files || [])];
        const out = [];
        for (const f of files.slice(0, cfg.composer.maxImages)) {
          out.push({ name: f.name, mime: f.type || 'image/png', bytes: new Uint8Array(await f.arrayBuffer()) });
        }
        resolve(out);
      };
      input.click();
    });
  },
};
