// Count visible characters rather than UTF-16 code units (emoji count once).
export function shouldAttachPastedText(text) {
  let lines = 1;
  for (const _ of text.matchAll(/\r\n|\r|\n/g)) {
    if (++lines > 128) return true;
  }
  let characters = 0;
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
  for (const _ of segments) {
    if (++characters > 1024) return true;
  }
  return false;
}

export function pastedTextFile(text, name = 'Pasted Text 1') {
  const bytes = new TextEncoder().encode(text).buffer;
  return {
    kind: /** @type {'file'} */ ('file'),
    name,
    pastedText: true,
    mime: 'text/plain',
    size: bytes.byteLength,
    read: async () => bytes,
  };
}

// Expand in a single pass so token-shaped text inside a pasted block stays literal.
export function expandPastedText(text, attachments) {
  const pasted = new Map(attachments.filter(item => item.pastedText && item.placeholder)
    .map(item => [item.placeholder, new TextDecoder().decode(item.bytes)]));
  return {
    text: text.replace(/<paste-[a-f0-9]{64}>/g, token => pasted.get(token) ?? token),
    attachments: attachments.filter(item => !item.pastedText),
  };
}
