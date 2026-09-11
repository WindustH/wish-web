// Browser file adapter: saving via anchor download, picking via <input>.

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

  // Metadata is returned before reading bytes so the composer can reject a
  // large file before allocating its buffer. Cancelling does not leave a picker.
  pickFiles({ multiple = false, accept = '' } = {}) {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.hidden = true;
      input.multiple = multiple;
      const finish = files => { input.remove(); resolve(files); };
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
