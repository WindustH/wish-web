import test from 'node:test';
import assert from 'node:assert/strict';
import { setBaseUrl } from '../src/core/api/client.ts';
import { imagePreviewUrl } from '../src/core/mediaPreview.ts';

test('blob image scenes use requested preview sizes and the original preference bypasses them', () => {
  setBaseUrl('https://wish.test/api');
  const original = `https://wish.test/api/sessions/session/blobs/${'a'.repeat(64)}`;
  assert.equal(imagePreviewUrl(original,384,false), original+'/image?width=384');
  assert.equal(imagePreviewUrl(original,768,false), original+'/image?width=768');
  assert.equal(imagePreviewUrl(original,1536,false), original+'/image?width=1536');
  assert.equal(imagePreviewUrl(original,768,true),original);
  assert.equal(imagePreviewUrl('data:image/png;base64,abc',768,false),'data:image/png;base64,abc');
  const external = original.replace('wish.test','other.test');
  assert.equal(imagePreviewUrl(external,768,false),external);
});
