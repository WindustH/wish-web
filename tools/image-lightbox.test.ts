import test from 'node:test';
import assert from 'node:assert/strict';
import { closeImageLightbox, imageLightbox, openImageLightbox } from '../src/ui/imageLightbox.ts';

test('the original viewer keeps its own authenticated image when a virtual thumbnail unmounts', t => {
  const revoked: string[] = [];
  t.mock.method(URL, 'createObjectURL', () => 'blob:viewer-owned');
  t.mock.method(URL, 'revokeObjectURL', (src: string) => { revoked.push(src); });
  openImageLightbox('blob:thumbnail', 'image', new Blob(['image']));
  URL.revokeObjectURL('blob:thumbnail'); // virtualized thumbnail cleanup
  assert.equal(imageLightbox.value?.src, 'blob:viewer-owned');
  assert.deepEqual(revoked, ['blob:thumbnail']);
  closeImageLightbox();
  assert.deepEqual(revoked, ['blob:thumbnail', 'blob:viewer-owned']);
});

test('switching to a public image releases only the viewer-owned URL', t => {
  const revoked: string[] = [];
  t.mock.method(URL, 'createObjectURL', () => 'blob:viewer-owned');
  t.mock.method(URL, 'revokeObjectURL', (src: string) => { revoked.push(src); });
  openImageLightbox('blob:thumbnail', '', new Blob(['image']));
  openImageLightbox('https://wish.test/image.png');
  assert.equal(imageLightbox.value?.src, 'https://wish.test/image.png');
  closeImageLightbox();
  assert.deepEqual(revoked, ['blob:viewer-owned']);
});
