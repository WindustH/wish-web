// Real media viewers with isolated mutable files and native browser touch input.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserFixture } from './browserFixture.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function pdf() {
  const drawing = '0.8 0.8 0.8 rg 20 20 260 360 re f 0 0 0 rg BT /F1 20 Tf 30 350 Td (Sharp PDF text) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>',
    `<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(body.length); body += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const offset = body.length;
  body += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(body);
}
const ids = { image: 'a'.repeat(64), pdf: 'b'.repeat(64), video: 'c'.repeat(64) };
const state = { version: { image: 1, pdf: 1, video: 1 }, pages: 6, missing: false, corrupt: false };
const counts = { metadata: 0, pages: [], media: 0 };
const directory = await mkdtemp(join(tmpdir(), 'wish-media-browser-'));
try {
  const videos = [];
  for (const seconds of [3, 1]) {
    const file = join(directory, `${seconds}.webm`);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=blue:s=160x90:d=${seconds}`, '-c:v', 'libvpx', '-an', file]);
    videos.push(await readFile(file));
  }
  const picture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><path fill="orange" d="M0 0h800v400H0z"/><path fill="blue" d="M400 0h400v400H400z"/></svg>');
  const pageBytes = pdf();
  const mime = { image: 'image/svg+xml', pdf: 'application/pdf', video: 'video/webm' };
  const files = () => Object.entries(ids).map(([kind, id]) => ({ id, mime_type: mime[kind], byte_count: 2000, modified_at: 1, linked: true, available: true, name: `Test.${kind === 'image' ? 'svg' : kind === 'pdf' ? 'pdf' : 'webm'}` }));
  const middleware = (request, response, next) => {
    const url = new URL(request.url, 'http://fixture');
    if (!url.pathname.startsWith('/api/')) return next();
    response.setHeader('cache-control', 'no-store');
    const json = (value, status = 200) => { response.statusCode = status; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
    if (url.pathname === '/api/sessions/s/blobs') return json({ items: files(), next: null, total: 3 });
    const [, id, action] = url.pathname.match(/\/blobs\/([a-f0-9]+)(.*)/) ?? [];
    const kind = Object.keys(ids).find(kind => ids[kind] === id);
    if (!kind) return json({ error: { message: 'not found' } }, 404);
    if (action === '/meta') {
      counts.metadata++;
      if (state.missing) return json({ error: { message: 'file missing' } }, 404);
      return json({ id, mime_type: mime[kind], byte_count: 2000, version: `${kind}-${state.version[kind]}` });
    }
    if (action === '/playback') return json({ path: `/sessions/s/blobs/${id}?v=${state.version[kind]}`, expires_at: Date.now() / 1000 + 3600 });
    if (action === '/pdf') return json({ pages: state.pages, version: `pdf-${state.version.pdf}`, bookmarks: [
      { title: 'Chapter 1', depth: 0, page: 1 }, { title: 'Section 1.1', depth: 1, page: 1 },
      { title: 'Details 1.1.1', depth: 2, page: 2 }, { title: 'Section 1.2', depth: 1, page: 2 },
      { title: 'Chapter 2', depth: 0, page: 2 },
    ] });
    if (action === '/pdf/page') {
      const page = Number(url.searchParams.get('page'));
      counts.pages.push(page);
      if (page > state.pages || state.corrupt) return json({ error: { message: 'page missing' } }, 400);
      response.setHeader('content-type', 'application/pdf'); return response.end(pageBytes);
    }
    if (action === '/image' || kind === 'image') {
      response.setHeader('content-type', mime.image); return response.end(picture);
    }
    if (kind === 'video') {
      counts.media++;
      const body = videos[Math.min(state.version.video - 1, 1)];
      response.setHeader('content-type', mime.video);
      response.setHeader('accept-ranges', 'bytes');
      const range = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
      if (range) {
        const start = Number(range[1]), end = Math.min(Number(range[2] || body.length - 1), body.length - 1);
        if (start >= body.length) { response.statusCode = 416; return response.end(); }
        response.statusCode = 206; response.setHeader('content-range', `bytes ${start}-${end}/${body.length}`);
        response.setHeader('content-length', end - start + 1); return response.end(body.subarray(start, end + 1));
      }
      response.setHeader('content-length', body.length); return response.end(body);
    }
    return json({}, 404);
  };
  const html = `<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>.island-heading{padding-right:56px!important}#sidebar-toggle{position:fixed;right:10px;top:8px;z-index:22}</style></head><body><div id="app"></div><span id="sidebar-toggle">◫</span><script type="module">
import {createApp,h,provide,ref} from 'vue';
import {TooltipProvider} from 'reka-ui';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {replyContextKey} from '/src/domain/references/context.ts';
import Library from '/src/features/sessions/SessionLibrary.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'media-test',version:1});window.references=[];
createApp({setup(){provide(replyContextKey,{session:ref('s'),revision:ref(0),add:async(reference,image)=>window.references.push({reference,bytes:image?.size}),links:async()=>[],locate:()=>{},jump:()=>{},preview:async()=>''});return()=>h(TooltipProvider,{},()=>h('main',{style:'position:relative;height:100dvh;display:flex'},[h(Library,{session:'s',mobile:true,open:true,entries:[],libraryRevision:0})]));}}).mount('#app');window.fixture=true;
</script></body></html>`;
  await browserFixture(html, async ({ js, until, click, send }) => {
    const touch = (type, points = []) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, index) => ({ ...point, id: index + 1, radiusX: 2, radiusY: 2 })) });
    async function open(kind) {
      if (await js('!!document.querySelector(".blob-preview")')) await click('.island-heading > button');
      await until(`!!document.querySelector('[data-blob-id="${ids[kind]}"]')`, 'library list');
      await sleep(350); // Drawer entrance / viewport resize must finish before a physical click.
      await click(`[data-blob-id="${ids[kind]}"]`);
    }
    const box = selector => js(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()`);
    const pdfGeometry = () => js(`(()=>{
      const page=window.zoomPage, canvas=page.querySelector('canvas'), text=page.querySelector('.textLayer span');
      const rect=element=>{const b=element.getBoundingClientRect();return [b.x,b.y,b.width,b.height]};
      return {page:rect(page),canvas:rect(canvas),text:rect(text),scrollWidth:document.querySelector('.pdf-viewport').scrollWidth};
    })()`);
    function sameGeometry(before, after, label) {
      for (const part of ['page', 'canvas', 'text'])
        before[part].forEach((value, index) => assert.ok(Math.abs(value - after[part][index]) < 1,
          `${label}: ${part}[${index}] moved from ${value} to ${after[part][index]}`));
      assert.equal(after.scrollWidth, before.scrollWidth, `${label}: repaint preserves the horizontal scroll range`);
    }
    function alignedPage(geometry, label) {
      geometry.page.forEach((value, index) => assert.ok(Math.abs(value - geometry.canvas[index]) < 1,
        `${label}: scaled canvas must occupy its page box at coordinate ${index}`));
    }
    async function holdRegion(selector) {
      const b = await box(selector);
      const start = { x: b.x + Math.min(b.w * .25, 80), y: b.y + Math.min(b.h * .2, 80) };
      await touch('touchStart', [start]);
      await sleep(500);
      await touch('touchMove', [{ x: start.x + 100, y: start.y + 100 }]);
      await until('!!document.querySelector(".region-selection-mask")', 'touch selection mask');
      await touch('touchEnd');
      await until('!!document.querySelector(".region-reply-menu")', 'touch reply menu');
      await click('.region-reply-menu button');
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await open('image');
    try { await until('document.querySelector(".image-preview img")?.naturalWidth===800', 'image ready'); }
    catch (error) { console.log(await js('({body:document.body.innerText,img:document.querySelector(".image-preview img")?.outerHTML})')); throw error; }
    assert.equal(await js('!!document.querySelector(".island-heading .image-toolbar")'), true, 'image controls share header');
    await holdRegion('.image-preview img');
    await until('window.references.length===1', 'touch image reply');
    assert.ok(await js('window.references[0].bytes>0&&window.references[0].reference.region.unit==="px"'));
    let b = await box('.image-viewport');
    let center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    await touch('touchStart', [{ x: center.x - 40, y: center.y }, { x: center.x + 40, y: center.y }]);
    await touch('touchMove', [{ x: center.x - 80, y: center.y }, { x: center.x + 80, y: center.y }]);
    await touch('touchEnd');
    await until('document.querySelector(".image-toolbar").textContent.includes("200%")', 'image pinch zoom');
    assert.equal(await js('window.visualViewport.scale'), 1, 'image pinch does not zoom UI');
    assert.equal(await js('!!document.querySelector(".region-selection-mask")'), false, 'pinch does not select');
    // A normal touch drag pans the zoomed image instead of creating a selection.
    const transform = await js('document.querySelector(".image-preview img").style.transform');
    await touch('touchStart', [center]); await touch('touchMove', [{ x: center.x + 40, y: center.y }]); await touch('touchEnd');
    assert.notEqual(await js('document.querySelector(".image-preview img").style.transform'), transform);
    await sleep(500);
    assert.equal(await js('!!document.querySelector(".region-selection-mask")'), false, 'swipe cancels hold');
    const beforeMiddle = await js('document.querySelector(".image-preview img").style.transform');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'middle', clickCount: 1, ...center });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'middle', buttons: 4, x: center.x - 30, y: center.y });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'middle', clickCount: 1, x: center.x - 30, y: center.y });
    assert.notEqual(await js('document.querySelector(".image-preview img").style.transform'), beforeMiddle, 'middle button pans image');
    await touch('touchStart', [center]); await touch('touchCancel'); await sleep(500);
    assert.equal(await js('!!document.querySelector(".region-selection-mask")'), false, 'cancelled touch never starts selection');
    await open('pdf');
    await until('!!document.querySelector(".native-pdf-page canvas")', 'real PDF render');
    await sleep(200);
    assert.equal(await js('!!document.querySelector(".island-heading .pdf-toolbar")'), true, 'PDF controls share header');
    assert.ok(await js('(()=>{const c=document.querySelector(".native-pdf-page canvas");return c.width/c.getBoundingClientRect().width>2.9})()'), '3x screen renders at actual device density');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'), 'mobile toolbar fits');
    await writeFile('/tmp/wish-pdf-mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 3, mobile: true });
    await sleep(250);
    assert.ok(await js('document.querySelector(".island-heading").scrollWidth<=320&&document.documentElement.scrollWidth<=320'), 'narrow header fits with sidebar toggle reserved');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await sleep(250);
    await holdRegion('.native-pdf-page canvas');
    await until('window.references.length===2', 'touch PDF reply');
    assert.equal(await js('window.references[1].reference.region.unit'), 'pt');
    b = await box('.pdf-viewport'); center = { x: b.x + b.w / 2, y: b.y + 160 };
    const initialWidth = await js('document.querySelector(".pdf-scroll").getBoundingClientRect().width');
    await js('window.zoomPage=document.querySelector(".pdf-scroll-page");window.zoomCanvas=window.zoomPage.querySelector("canvas")');
    await touch('touchStart', [{ x: center.x - 40, y: center.y }, { x: center.x + 40, y: center.y }]);
    await touch('touchMove', [{ x: center.x - 70, y: center.y }, { x: center.x + 70, y: center.y }]);
    await until(`document.querySelector('.pdf-scroll').getBoundingClientRect().width>${initialWidth * 1.6}`, 'PDF pinch grows document');
    const enlarged = await pdfGeometry();
    alignedPage(enlarged, 'zoom in before repaint');
    await touch('touchEnd');
    await until('window.zoomPage.querySelector("canvas")!==window.zoomCanvas', 'PDF replaces the zoomed bitmap');
    await until('(()=>{const c=document.querySelector(".native-pdf-page canvas");return c&&Math.abs(c.width/c.getBoundingClientRect().width-3)<.05})()', 'PDF repaints sharply after pinch');
    sameGeometry(enlarged, await pdfGeometry(), 'zoom in');
    await js('window.zoomCanvas=window.zoomPage.querySelector("canvas")');
    await touch('touchStart', [{ x: center.x - 70, y: center.y }, { x: center.x + 70, y: center.y }]);
    await touch('touchMove', [{ x: center.x - 35, y: center.y }, { x: center.x + 35, y: center.y }]);
    await until(`document.querySelector('.pdf-scroll').getBoundingClientRect().width<${initialWidth}`, 'PDF pinch shrinks below fit width');
    const reduced = await pdfGeometry();
    alignedPage(reduced, 'zoom out before repaint');
    await touch('touchEnd');
    await until('window.zoomPage.querySelector("canvas")!==window.zoomCanvas', 'PDF replaces the reduced bitmap');
    sameGeometry(reduced, await pdfGeometry(), 'zoom out');
    assert.equal(await js('window.visualViewport.scale'), 1, 'PDF pinch leaves UI scale fixed');
    const top = await js('document.querySelector(".pdf-viewport").scrollTop');
    await touch('touchStart', [center]);
    for (let n = 1; n <= 5; n++) { await touch('touchMove', [{ x: center.x, y: center.y - n * 25 }]); await sleep(30); }
    await touch('touchEnd'); await sleep(500);
    assert.ok(await js(`document.querySelector('.pdf-viewport').scrollTop>${top+20}`), 'single finger still scrolls PDF');
    assert.equal(await js('!!document.querySelector(".region-selection-mask")'), false, 'scroll does not select');
    await click('.pdf-toolbar button');
    assert.equal(await js('document.querySelectorAll(".pdf-bookmark-row").length'), 2, 'chapters start collapsed');
    await click('.pdf-bookmark-toggle');
    assert.equal(await js('document.querySelectorAll(".pdf-bookmark-row").length'), 4, 'expand only one level');
    await js('document.querySelectorAll(".pdf-bookmark-toggle")[1].click()');
    assert.equal(await js('document.querySelectorAll(".pdf-bookmark-row").length'), 5);
    await click('.pdf-bookmark-toggle');
    assert.equal(await js('document.querySelectorAll(".pdf-bookmark-row").length'), 2, 'collapsing hides all descendants');
    await click('.pdf-toolbar button');
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    const wheel = await js(`(()=>{const v=document.querySelector('.pdf-viewport'),b=v.getBoundingClientRect();const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-25,clientX:b.x+150,clientY:b.y+120});const before=document.querySelector('.pdf-scroll').getBoundingClientRect().width;v.dispatchEvent(e);return {prevented:e.defaultPrevented,before}})()`);
    assert.equal(wheel.prevented, true, 'viewer owns Ctrl+wheel');
    await until(`document.querySelector('.pdf-scroll').getBoundingClientRect().width>${wheel.before}`, 'Ctrl+wheel zooms PDF');
    assert.equal(await js(`(()=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-30});document.body.dispatchEvent(e);return e.defaultPrevented})()`), false, 'ordinary UI keeps browser Ctrl+wheel');
    await js('document.querySelector(".pdf-viewport").scrollTop=200');
    b = await box('.pdf-viewport');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'middle', clickCount: 1, x: b.x + 200, y: b.y + 200 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'middle', buttons: 4, x: b.x + 160, y: b.y + 120 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'middle', clickCount: 1, x: b.x + 160, y: b.y + 120 });
    assert.ok(await js('document.querySelector(".pdf-viewport").scrollTop>250'), 'middle button pans PDF');
    assert.equal(await js('!!document.querySelector(".region-selection-mask")'), false);
    state.pages = 2; state.version.pdf++;
    await js('(()=>{const input=document.querySelector(".pdf-page-number input");input.value="6";input.dispatchEvent(new Event("change",{bubbles:true}))})()');
    await until('document.querySelector(".pdf-page-number input")?.max==="2"', 'missing old page reloads changed PDF');
    assert.equal(await js('document.querySelector(".pdf-page-number input").value'), '1', 'changed PDF restores a valid page');
    await until('!!document.querySelector(".native-pdf-page canvas")', 'new PDF rendered');
    await open('video');
    await until('document.querySelector("video")?.readyState>=2', 'video loaded');
    await js('document.querySelector("video").currentTime=2.4');
    await until('document.querySelector("video").currentTime>2', 'video seek');
    state.version.video++;
    await js('document.querySelector("video").dispatchEvent(new Event("error"))');
    try { await until('document.querySelector("video")?.duration===1', 'changed video reloads shorter content'); }
    catch (error) { console.log(counts, await js('({body:document.body.innerText,video:document.querySelector("video")?.outerHTML,duration:document.querySelector("video")?.duration,time:document.querySelector("video")?.currentTime})')); throw error; }
    assert.ok(await js('document.querySelector("video").currentTime<=1'), 'restored video time remains in bounds');
    const mediaCount = counts.media;
    await js('document.querySelector("video").dispatchEvent(new Event("error"))');
    await until('!!document.querySelector(".blob-preview [role=alert]")', 'unchanged bad media reports error');
    await sleep(700);
    assert.equal(counts.media, mediaCount, 'unchanged failure never loops');
    await click('.blob-preview [role=alert] button');
    await until('document.querySelector("video")?.readyState>=2', 'manual recovery remains available');
    state.missing = true;
    await js('document.querySelector("video").dispatchEvent(new Event("error"))');
    await until('document.querySelector(".blob-preview [role=alert]")?.textContent.includes("file missing")', 'deleted source shows a stable error');
    await writeFile('/tmp/wish-media-viewer.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    console.log('Touch hold reply, swipe/pinch separation, DPR rendering, Ctrl+wheel, middle drag, compact headers, collapsed bookmarks and changed-file recovery passed');
  }, { middleware });
} finally {
  await rm(directory, { recursive: true, force: true });
}
