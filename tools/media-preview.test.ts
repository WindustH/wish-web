import test from 'node:test';
import assert from 'node:assert/strict';
import { setBaseUrl } from '../src/core/api/client.ts';
import { imagePreviewUrl } from '../src/core/api/endpoints.ts';

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

test('PDF page cache distinguishes source revisions and page numbers and honors cancellation', async (t) => {
  const { pdfPage } = await import('../src/domain/media/requests.ts');
  const { previewCache } = await import('../src/core/util/previewCache.ts');
  previewCache.clear();
  setBaseUrl('https://wish.test/api');
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(new Blob(['%PDF-page'], {type:'application/pdf'}));
  });
  const signal = new AbortController().signal;
  const first = await pdfPage('s', 'blob', 1, signal, 'v1');
  assert.equal(await pdfPage('s', 'blob', 1, signal, 'v1'), first);
  assert.equal(requests, 1);
  await pdfPage('s', 'blob', 2, signal, 'v1');
  await pdfPage('s', 'blob', 1, signal, 'v2');
  assert.equal(requests, 3);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(pdfPage('s', 'blob', 1, cancelled.signal, 'v1'), {name:'AbortError'});
  assert.equal(requests, 3);
  previewCache.clear();
});

test('raw PDF endpoint bypasses the domain cache', async (t) => {
  const { pdfPage } = await import('../src/core/api/endpoints.ts');
  setBaseUrl('https://wish.test/api');
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response('%PDF'); });
  const signal = new AbortController().signal;
  await pdfPage('s', 'blob', 1, signal);
  await pdfPage('s', 'blob', 1, signal);
  assert.equal(requests, 2);
});

test('tiny video captures without waiting for a seeked event that never arrives', async (t) => {
  const { videoThumbnail } = await import('../src/domain/media/videoThumbnail.ts');
  let draws = 0, cleaned = false;
  const video: any = {
    duration: 0.001, currentTime: 0, seeking: false, videoWidth: 100, videoHeight: 100,
    pause() {}, removeAttribute() {}, load() { cleaned = true; },
    set src(_: string) { queueMicrotask(() => this.onloadeddata()); },
  };
  const canvas = { getContext: () => ({ drawImage: () => { draws++; } }), toBlob: (callback: (value: Blob) => void) => callback(new Blob(['cover'])) };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (kind: string) => kind === 'video' ? video : canvas } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); });
  assert.equal(await (await videoThumbnail('video', new AbortController().signal)).text(), 'cover');
  assert.equal(draws, 1);
  assert.equal(cleaned, true);
});

test('persisted image references resolve to session URLs in their original content order', async () => {
  const { entryView } = await import('../src/core/api/projections.ts');
  const image = { mime_type: 'image/png', blob_id: 'a'.repeat(64), byte_count: 12 };
  const projected = entryView({record:{sequence:1,recorded_at:0}, content:{kind:'message',value:{id:1,message:{Assistant:{content:[{Text:{text:'before'}},{ImageRef:image},{Text:{text:'after'}}]}}}}}, 'session');
  assert.deepEqual(projected.payload.content, [{type:'text',text:'before'},{type:'image',...image,blob_id:`session/${image.blob_id}`},{type:'text',text:'after'}]);
});
