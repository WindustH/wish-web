import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAttachmentText, attachmentsForMessage } from '../src/core/attachmentPlaceholders.js';
import { orderedUserContent, userBubbles } from '../src/core/api/userContent.js';
const attachments = [1, 2, 3].map(n => ({ kind: 'image', placeholder: `<image-${String(n).repeat(64)}>`, id: String(n) }));
test('image placeholders preserve text and image ordering including adjacent images', () => {
  const text = `text1${attachments[0].placeholder}text2 text3${attachments[1].placeholder}${attachments[2].placeholder}text4`;
  const parts = splitAttachmentText(text, attachments);
  assert.deepEqual(parts.map(p => p.type), ['text', 'attachment', 'text', 'attachment', 'attachment', 'text']);
  assert.equal(parts.map(p => p.text).join(''), text);
});
test('deleted markers omit images while legacy images and files remain attached', () => {
  const legacy = { kind: 'image' }, file = { kind: 'file' };
  assert.deepEqual(attachmentsForMessage(attachments[1].placeholder, [...attachments, legacy, file]), [attachments[1], legacy, file]);
  assert.deepEqual(splitAttachmentText('literal <Image 9>', attachments), [{ type: 'text', text: 'literal <Image 9>', start: 0 }]);
});
test('persisted display order produces the requested six independent bubbles', () => {
  const message = { metadata: { attachments, input_parts: [
    { type: 'text', text: 'text1' }, { type: 'attachment', index: 0 },
    { type: 'text', text: 'text2 ' }, { type: 'text', text: 'text3' },
    { type: 'attachment', index: 1 }, { type: 'attachment', index: 2 }, { type: 'text', text: 'text4' },
  ] } };
  const bubbles = userBubbles(orderedUserContent(message, 'session', []));
  assert.deepEqual(bubbles.map(b => b.type), ['text', 'image', 'text', 'image', 'image', 'text']);
  assert.equal(bubbles[2].text, 'text2 text3');
  assert.equal(bubbles[3].blob_id, 'session/2');
});

 test('SHA-256 matches native hashing including padding boundaries and binary images', async () => {
  const { createHash, randomBytes } = await import('node:crypto');
  const { attachmentDigest, attachmentDigestFallback } = await import('../src/core/attachmentDigest.js');
  for (const size of [0, 1, 55, 56, 63, 64, 65, 1024, 65537]) {
    const bytes = new Uint8Array(randomBytes(size)).buffer;
    const expected = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
    assert.equal(attachmentDigestFallback(bytes), expected);
    assert.equal(await attachmentDigest(bytes), expected);
  }
});

test('file and image references share ordered atomic parsing without matching ordinary names', () => {
  const file = { kind: 'file', placeholder: `<file-${'a'.repeat(64)}>` };
  const text = `before${file.placeholder}middle${attachments[0].placeholder}after`;
  const parts = splitAttachmentText(text, [file, attachments[0]]);
  assert.deepEqual(parts.map(p => p.type), ['text', 'attachment', 'text', 'attachment', 'text']);
  assert.equal(parts[1].attachment, file);
  assert.deepEqual(attachmentsForMessage('File 1', [file]), []);
  assert.equal(splitAttachmentText('File 1', [file])[0].type, 'text');
});
