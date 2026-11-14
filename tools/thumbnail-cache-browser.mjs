// Cached thumbnails remain visible while mutable local files are revalidated.
import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';

function pdf() {
  const drawing = '0.8 0.5 0.2 rg 20 20 260 360 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const offset = body.length;
  body += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(body);
}
const ids = { pdf: 'a'.repeat(64), image: 'b'.repeat(64), audio: 'c'.repeat(64), video: 'd'.repeat(64) };
const page = pdf();
const state = { version: 1, hold: false };
const counts = { info: 0, pages: 0, images: 0, metadata: 0, originals: 0 };
const held = [];
const release = () => {
  state.hold = false;
  for (const respond of held.splice(0)) respond();
};
const middleware = (request, response, next) => {
  const url = new URL(request.url, 'http://fixture');
  if (!url.pathname.startsWith('/api/')) return next();
  response.setHeader('cache-control', 'no-store');
  const json = value => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
  const respond = () => {
    if (url.pathname.endsWith('/pdf')) {
      counts.info++;
      return json({ pages: 1, version: `v${state.version}`, bookmarks: [] });
    }
    if (url.pathname.endsWith('/pdf/page')) {
      counts.pages++;
      response.setHeader('content-type', 'application/pdf');
      return response.end(page);
    }
    if (url.pathname.endsWith('/meta')) {
      counts.metadata++;
      return json({ version: 'v1', byte_count: 1000, mime_type: 'audio/mpeg' });
    }
    if (url.pathname.includes(ids.image)) {
      if (url.pathname.endsWith('/image')) counts.images++;
      else counts.originals++;
      response.setHeader('content-type', 'image/svg+xml');
      response.setHeader('etag', `"v${state.version}"`);
      return response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><path fill="${state.version === 1 ? 'orange' : 'blue'}" d="M0 0h300v200H0z"/></svg>`);
    }
    response.statusCode = 404;
    json({ error: { message: 'Unexpected media request' } });
  };
  if (state.hold) held.push(respond);
  else respond();
};
const html = `<!doctype html><html data-theme="dark"><body><div id="app"></div><script type="module">
import { createApp, h, ref, nextTick } from 'vue';
import { registerBrowserPlatform } from '/src/platform/browser/index.ts';
import { prefs } from '/src/core/state/prefsSlice.ts';
import { blobUrl, imagePreviewUrl } from '/src/core/api/endpoints.ts';
import { setAccessToken } from '/src/core/api/client.ts';
import { previewCache } from '/src/core/util/previewCache.ts';
import { acquireImageLoad } from '/src/core/util/imageLoad.ts';
import { thumbnail, thumbnailKey } from '/src/domain/media/thumbnail.ts';
import LibraryThumbnail from '/src/features/sessions/LibraryThumbnail.vue';
import '/src/styles/tokens.css';
registerBrowserPlatform({namespace:'thumbnail-test',version:1});
setAccessToken('isolated-fixture');
const ids = ${JSON.stringify(ids)};
const make = (kind, mime) => ({id:ids[kind],mime_type:mime,byte_count:1000,modified_at:1,linked:true,available:true});
const documentBlob = ref(make('pdf','application/pdf'));
const pictureBlob = ref(make('image','image/svg+xml'));
const mounted = ref(true);
window.refresh = async () => {documentBlob.value = {...documentBlob.value}; pictureBlob.value = {...pictureBlob.value}; await nextTick();};
window.toggle = async (value) => {mounted.value = value; await nextTick();};
window.original = async () => {prefs.originalImages.value = true; await nextTick();};
window.remove = async () => {documentBlob.value = {...documentBlob.value, available:false}; pictureBlob.value = {...pictureBlob.value, available:false}; await nextTick();};
window.cache = previewCache;
window.imageKey = 'image:' + imagePreviewUrl(blobUrl('s/' + ids.image),384,false);
window.originalKey = 'image:' + blobUrl('s/' + ids.image);
window.encodes = 0;
const encode = HTMLCanvasElement.prototype.toBlob;
HTMLCanvasElement.prototype.toBlob = function(...args) {window.encodes++; return encode.apply(this,args);};
window.fetching = 0;
const fetch = window.fetch.bind(window);
window.fetch = async (...args) => {window.fetching++; try {return await fetch(...args);} finally {window.fetching--;}};
window.revoked = [];
const revoke = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = value => {window.revoked.push(value); revoke(value);};
window.checkOtherCovers = async () => {
  const audio = make('audio','audio/mpeg'), video = make('video','video/webm');
  const cover = new Blob(['cover'], {type:'image/webp'});
  previewCache.set(thumbnailKey('s', audio), null, 'v1');
  previewCache.set(thumbnailKey('s', video), cover, 'v1');
  const signal = new AbortController().signal;
  // Revalidation of cached covers must not wait for a decoder slot.
  const releases = await Promise.all(Array.from({length:4}, () => acquireImageLoad(signal)));
  try {
    return await Promise.race([
      Promise.all([thumbnail('s', audio, signal), thumbnail('s', video, signal)]).then(([a,v]) => a === null && v === cover),
      new Promise(resolve => setTimeout(() => resolve(false), 1500)),
    ]);
  } finally {releases.forEach(release => release());}
};
createApp({setup(){return () => h('main', {style:'display:flex;gap:20px;width:600px'}, mounted.value ? [
  h(LibraryThumbnail, {id:'pdf',session:'s',blob:documentBlob.value}),
  h(LibraryThumbnail, {id:'image',session:'s',blob:pictureBlob.value}),
] : []);}}).mount('#app');
window.fixture = true;
</script></body></html>`;

await browserFixture(html, async ({ js, until }) => {
  const sources = () => js(`[...document.querySelectorAll('.library-thumbnail img')].map(image => image.src)`);
  await until(`document.querySelectorAll('.library-thumbnail img').length === 2 && [...document.querySelectorAll('.library-thumbnail img')].every(image => image.naturalWidth > 0)`, 'initial covers render');
  const initial = await sources();
  assert.equal(counts.pages, 1);
  assert.equal(await js('window.encodes'), 1);

  state.hold = true;
  await js('window.refresh()');
  assert.deepEqual(await sources(), initial, 'polling does not clear or replace current covers');
  release();
  await until('window.fetching === 0', 'background validation finishes');
  assert.deepEqual(await sources(), initial, 'unchanged source keeps the same object URL');
  assert.equal(counts.pages, 1);
  assert.equal(await js('window.encodes'), 1, 'unchanged PDF is not rasterized again');

  state.hold = true;
  await js('window.toggle(false)');
  for (const source of initial) assert.ok(await js(`window.revoked.includes(${JSON.stringify(source)})`), 'unmount releases display URLs');
  await js('window.toggle(true)');
  await until(`document.querySelectorAll('.library-thumbnail img').length === 2 && [...document.querySelectorAll('.library-thumbnail img')].every(image => image.naturalWidth > 0)`, 'cached covers paint before network validation');
  const remounted = await sources();
  release();
  await until('window.fetching === 0', 'remount revalidation finishes');
  assert.deepEqual(await sources(), remounted, 'unchanged image ETag does not replace the cached object URL');
  assert.equal(counts.pages, 1);
  assert.equal(await js('window.encodes'), 1);

  state.version = 2;
  state.hold = true;
  await js('window.toggle(false)');
  await js('window.toggle(true)');
  await until(`document.querySelectorAll('.library-thumbnail img').length === 2 && [...document.querySelectorAll('.library-thumbnail img')].every(image => image.naturalWidth > 0)`, 'old covers remain usable during changed-file validation');
  const beforeUpdate = await sources();
  release();
  await until(`[...document.querySelectorAll('.library-thumbnail img')].every((image,index) => image.naturalWidth > 0 && image.src !== ${JSON.stringify(beforeUpdate)}[index])`, 'changed files replace cached covers');
  assert.equal(counts.pages, 2);
  assert.equal(await js('window.encodes'), 2);
  assert.equal(await js('window.cache.entry(window.imageKey).version'), '"v2"');

  assert.equal(await js('window.checkOtherCovers()'), true, 'linked audio/video covers revalidate without decoding or queuing');
  assert.equal(counts.metadata, 2);
  await js('window.original()');
  await until(`document.querySelector('#image img')?.naturalWidth > 0 && window.fetching === 0`, 'original image preference still loads');
  assert.equal(counts.originals, 1);
  assert.equal(await js('window.cache.entry(window.originalKey) === undefined'), true, 'original uploads are not retained in the thumbnail cache');
  await js('window.remove()');
  assert.equal(await js('document.querySelectorAll(".library-thumbnail img").length'), 0, 'unavailable files do not retain old thumbnails');
  console.log('Thumbnail cache: refresh, remount, linked-file edits, image ETags, decode limits and URL cleanup passed.');
}, { middleware });
