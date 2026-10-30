// Debug settings layout and dedicated detail windows.
// Run: node tools/debug-windows-browser.mjs (CHROME may override the executable).
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
import DebugSettings from '/src/features/debug/DebugSettings.vue';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {stalls} from '/src/domain/diagnostics/scrollStalls.ts';
registerBrowserPlatform({ namespace: 'wish-webui', version: 1 });
stalls.value=[{at:'2026-10-26T00:00:00Z',kind:'wheel',route:'#/s/test',target:'button',layers:[],build:'fixture'}];
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/features.css';import '/src/domain/settings/settings.css';
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]});
createApp({render:()=>h(TooltipProvider,{},()=>h('main',{style:'width:100%;max-width:736px;margin:24px auto;padding:16px'},h(DebugSettings)))}).use(router).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, define:{__BUILD_ID__:JSON.stringify('fixture')}, root: process.cwd(), plugins: [vue(), {name:'pwa-fixture',resolveId(id){if(id==='virtual:pwa-register')return id;},load(id){if(id==='virtual:pwa-register')return 'export const registerSW=()=>()=>{}';}}, {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__debug_windows', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__debug_windows', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/debug/StylePreview.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-debug-windows-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__debug_windows`});
  await until('!!document.querySelector("#settings-debug-styles")','debug settings mounted');
  assert.equal(await js('!!document.querySelector(".style-preview, .stall-list, [role=dialog]")'),false,'details are initially closed');
  await mkdir('.cache/debug-settings', {recursive:true});
  for (const width of [390, 1200]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width===390});
    for (const theme of ['dark','light']) {
      await js(`document.documentElement.dataset.theme='${theme}'`);
      await sleep(100);
      assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'),true,'page fits viewport');
      assert.equal(await js('document.querySelectorAll(".debug-card").length'),2,'entries share two complete cards');
      const shot=await send('Page.captureScreenshot',{format:'png'});
      await writeFile(`.cache/debug-settings/${width}-${theme}.png`,Buffer.from(shot.data,'base64'));
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for (const entry of ['icons','diagnostics']) {
    await js(`document.querySelector('#settings-debug-${entry} button').click()`);
    await until('!!document.querySelector("[role=dialog]")','detail opens');
    assert.equal(await js('!!document.querySelector(".debug-detail-window.modal-page .modal-head > button")'),true,'mobile details have a page header with back button');
    assert.equal(await js('Math.round(document.querySelector(".debug-detail-window").getBoundingClientRect().width)===innerWidth'),true,'mobile detail fills viewport');
    if (entry==='icons') await until('!!document.querySelector("[role=dialog] .icon-gallery")','icon library loaded');
    await js('document.querySelector(".debug-detail-window .modal-head > button, .debug-detail-window .dialog-toolbar button").click()');
    await until('!document.querySelector("[role=dialog]")','detail closes');
  }

  assert.equal(await js('document.querySelector("#activity-debug-enabled").getAttribute("aria-checked")'), 'false', 'debug mode defaults off');
  await js('document.querySelector("#activity-debug-enabled").click()');
  await until('document.querySelector("#activity-debug-enabled").getAttribute("aria-checked")==="true"','enable debug mode');
  await js('document.querySelector("#settings-debug-activity button[aria-haspopup=dialog]").click()');
  await until('!!document.querySelector(".activity-preview")','activity export panel');
  await js('document.querySelector(".debug-detail-window .modal-head > button, .debug-detail-window .dialog-toolbar button").click()');
  await until('!document.querySelector("[role=dialog]")','close log panel');
  await js('document.querySelector("#activity-debug-enabled").click()');
  await js(`document.querySelector('#settings-debug-scroll button').click()`);
  await until('!!document.querySelector("[role=dialog] .stall-list")','stalls open in dedicated dialog');
  assert.equal(await js('document.querySelectorAll(".stall-list li").length'),1);
  await js(`document.querySelector('.debug-detail-window .modal-head > button, .debug-detail-window .dialog-toolbar button').click()`);
  await until('!document.querySelector("[role=dialog]")','close stalls');
  await js(`document.querySelector('#settings-debug-styles button').click()`);
  await until('document.querySelectorAll("[role=dialog] .preview-sample").length===19','style preview opens in dedicated dialog');
  await js(`document.querySelector('[data-preview=stacked-files] button').click()`);
  await until('document.querySelectorAll("[role=dialog]").length===2','file detail opens over style preview');
  await js(`document.querySelector('.file-changes-heading button').click()`);
  await until('document.querySelectorAll("[role=dialog]").length===1','closing detail preserves preview');
  await js(`document.querySelector('.debug-detail-window .modal-head > button, .debug-detail-window .dialog-toolbar button').click()`);
  await until('!document.querySelector("[role=dialog]")','closing preview returns to settings');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:844,deviceScaleFactor:1,mobile:false});
  await js(`document.querySelector('#settings-debug-scroll button').click()`);
  await until('!!document.querySelector("[role=dialog] .stall-list")','desktop stalls dialog');
  assert.equal(await js('!!document.querySelector(".debug-detail-window.modal-page")'),false,'desktop retains compact dialog');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['default collapsed','dedicated stalls window','dedicated preview window','nested file detail closes independently','mobile and desktop']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
