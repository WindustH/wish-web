// File cards, stacking and session-owned detail windows.
// Run: node tools/file-changes-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h} from 'vue';import {TooltipProvider} from 'reka-ui';
import {createRouter,createMemoryHistory} from 'vue-router';
import StylePreview from '/src/features/settings/StylePreview.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/features.css';
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]});
createApp({render:()=>h(TooltipProvider,{},()=>h('main',{style:'max-width:736px;margin:24px auto;padding:16px'},h(StylePreview)))}).use(router).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__style_preview', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__style_preview', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/settings/StylePreview.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-style-preview-'));
let chrome, ws;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  chrome = spawn(process.env.CHROME || '/usr/bin/google-chrome-stable', ['--headless=new','--no-first-run','--disable-extensions',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'], { stdio: 'ignore' });
  let debugPort;
  for(let n=0;n<100;n++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
  assert.ok(debugPort, 'Chrome must start');
  const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  ws = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(), exceptions=[];
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await js(expression))return;await sleep(100);}throw Error(label+' '+JSON.stringify({exceptions,dom:await js('Array.from(document.querySelectorAll("[role=dialog]")).map(x=>x.outerHTML.slice(0,1500))'),fixture:await js('!!window.fixture')}));};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__style_preview`});
  await until('document.querySelectorAll(".preview-sample").length===19','all gallery samples');
  for(const width of [390,1200]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width===390});
    for(const theme of ['dark','light']) {
      await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow');
      await mkdir('.cache/style-preview',{recursive:true});
      const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      await writeFile(`.cache/style-preview/${width}-${theme}.png`,Buffer.from(image.data,'base64'));
    }
  }
  for (const width of [390, 1200]) {
    await send('Emulation.setDeviceMetricsOverride', {width,height:844,deviceScaleFactor:1,mobile:width===390});
    assert.ok(await js(`Array.from(document.querySelectorAll('.attachment-composer-sample')).every(el => el.querySelector('.composer-attachment-tray').getBoundingClientRect().bottom < el.getBoundingClientRect().top)`), 'attachments float above the input border');
    await js('document.querySelector("[data-preview=composer-stack] .attachment-stack").scrollIntoView({block:"center"});document.querySelector("[data-preview=composer-stack] .attachment-stack").click()');
    await until('document.querySelectorAll(".composer-attachments-window .attach-thumb").length===7', 'window shows every attachment');
    assert.equal(await js('document.querySelectorAll("[data-preview=composer-stack] .attach-thumb").length'), 0, 'stack stays compact outside window');
    await sleep(200); // Popper measures and positions after the portal mounts.
    const popup = await js(`(() => { const el = document.querySelector('.composer-attachments-window'); const style = getComputedStyle(el); const rect = el.getBoundingClientRect(); return { width: rect.width, left: rect.left, right: rect.right, display: style.display, background: style.backgroundColor, border: style.borderTopWidth, overflow: el.scrollWidth > el.clientWidth }; })()`);
    assert.equal(popup.display, 'flex', 'portal receives its component styles');
    assert.notEqual(popup.background, 'rgba(0, 0, 0, 0)', 'popup has an opaque surface');
    assert.ok(popup.width <= 400 && popup.width > 200, 'popup width stays compact');
    assert.ok(popup.left >= 0 && popup.right <= width, 'popup fits viewport: ' + JSON.stringify(popup));
    assert.equal(popup.overflow, false, 'attachments stay inside popup');
    const popupImage = await send('Page.captureScreenshot', {format:'png'});
    await writeFile(`.cache/style-preview/attachments-${width}.png`, Buffer.from(popupImage.data, 'base64'));

    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'), 'attachment window does not widen page');
    await js('document.querySelector(".composer-attachments-window .dialog-toolbar button").click()');
    await until('!document.querySelector(".composer-attachments-window")', 'close attachment window');
  }
  await js('document.querySelector("[data-preview=composer-stack] .attachment-stack").click()');
  await until('document.querySelectorAll(".composer-attachments-window .rm").length===7', 'window remove buttons');
  await js('document.querySelector(".composer-attachments-window .rm").click()');
  await until('document.querySelectorAll(".composer-attachments-window .rm").length===6', 'deletion keeps window open');
  await js('document.querySelector(".composer-attachments-window .rm").click()');
  await until('document.querySelectorAll(".composer-attachments-window .rm").length===5', 'crossing stack threshold keeps window open');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until('!document.querySelector(".composer-attachments-window") && document.querySelectorAll("[data-preview=composer-stack] .attach-thumb").length===5', 'Escape closes window and restores five inline thumbnails');
  async function close() {
    await sleep(500); // Wait for the opening transition and focus trap before Escape.
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until('!document.querySelector("[role=dialog]")','dialog closes');
  }
  await js('document.querySelector("[data-preview=stacked-files] button").click()');
  await until('document.querySelectorAll(".file-diff").length===6','stack shows six diffs');
  await close();
  await js('document.querySelector("select").value="sessions";document.querySelector("select").dispatchEvent(new Event("change",{bubbles:true}))');
  await until('document.querySelectorAll(".preview-sample").length===6','session category');
  assert.equal(await js('document.querySelectorAll(".group-card a").length'),0,'preview must not navigate to fabricated groups');
  await js('document.querySelector("[data-preview=group-received] .group-card-open").click()');
  await until('!!document.querySelector("[role=dialog]")','group detail opens');
  assert.equal(await js('document.querySelectorAll(".group-card-detail a").length'),0);
  await js('document.querySelector(".group-card-actions button:last-child").click()');
  await until('!document.querySelector("[role=dialog]")','group close button');
  await js('document.querySelector("[data-preview=session-send] button").click()');
  await until('!!document.querySelector(".proc-event")','session operation timeline');
  await close();
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['19 real-component samples','desktop/mobile dark/light','six-file dialog','category filter','group details without navigation','session operation timeline']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
