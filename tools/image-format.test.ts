import test from 'node:test';
import assert from 'node:assert/strict';
import { imageFormat, supportedImageMime } from '../src/core/imageFormat.ts';
import { initialInput, initialSessionName } from '../src/core/attachments.ts';

test('HEIF masquerading as PNG is rejected by content; genuine formats ignore extensions', () => {
  const heif = new Uint8Array([0,0,0,24,...new TextEncoder().encode('ftypheic'),0,0,0,0,...new TextEncoder().encode('heicmif1')]).buffer;
  assert.equal(imageFormat(heif), 'image/heif');
  assert.equal(supportedImageMime(heif), undefined);
  assert.equal(supportedImageMime(new Uint8Array([255,216,255,224]).buffer), 'image/jpeg');
  assert.equal(supportedImageMime(new ArrayBuffer(0)), undefined);
});
test('first input preserves binary bytes and placeholders, but a title never contains the marker', async () => {
  const attachment = { kind: 'image' as const, bytes: new Uint8Array([0,255,128,10]).buffer, mime: 'image/png', name: 'photo.png', placeholder: '<image-hash>' };
  const input = await initialInput('See <image-hash>', [attachment], 'request');
  assert.match(input.attachments[0]!.id, /^[a-f0-9]{64}$/);
  assert.deepEqual([...new Uint8Array(attachment.bytes)], [0,255,128,10]);
  assert.equal(input.attachments[0]!.placeholder, '<image-hash>');
  assert.equal(initialSessionName('See <image-hash>', [attachment]), 'See photo.png');
});

test('BMP and TIFF are accepted for server-side model normalization', () => {
  assert.equal(supportedImageMime(new Uint8Array([66,77,0,0]).buffer), 'image/bmp');
  assert.equal(supportedImageMime(new Uint8Array([73,73,42,0]).buffer), 'image/tiff');
  assert.equal(supportedImageMime(new Uint8Array([77,77,0,42]).buffer), 'image/tiff');
});
