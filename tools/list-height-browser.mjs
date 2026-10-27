// Session list width and fade stability when height toggles vertical overflow.
// Run: node tools/list-height-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="light"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h} from 'vue';import {TooltipProvider} from 'reka-ui';
import {createRouter,createMemoryHistory} from 'vue-router';
import SessionList from '/src/features/sessions/SessionList.vue';
import {sessions} from '/src/core/state/sessionsSlice.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/layout.css';import '/src/styles/features.css';
registerBrowserPlatform({ namespace: 'wish-webui', version: 1 });
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push('/s/s1');
const rawFetch=window.fetch;
window.fetch=async(input,options)=>{
 const url=String(input);
 if(url.includes('/conversations'))return new Response(JSON.stringify({items:Array.from({length:9},(_,i)=>({kind:'session',session:{id:'s'+i,name:'Session '+i+' — a long conversation title that needs a fixed fade',updated_at:Date.now(),metadata:{}},status:{phase:'Idle',running:false,config:{}}})),next:null}),{headers:{'content-type':'application/json'}});
 if(url.endsWith('/folders'))return new Response('[]',{headers:{'content-type':'application/json'}});
 return rawFetch(input,options);
};
await sessions.loadFirst();
createApp({render:()=>h(TooltipProvider,null,{default:()=>h('div',{style:'width:350px;height:100dvh;display:flex;position:fixed;top:0;left:0;'},[h(SessionList)])})}).use(router).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {name:'pwa-fixture',resolveId(id){if(id==='virtual:pwa-register')return id;},load(id){if(id==='virtual:pwa-register')return 'export const registerSW=()=>()=>{}';}}, {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__list_height', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__list_height', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/ui/domain/settings/ToolSwitchRows.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-list-height-'));
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
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await js(expression))return;await sleep(100);}throw Error(label+' '+JSON.stringify({exceptions,dom:await js('document.body.innerHTML.slice(0,1500)')}));};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__list_height`});
  await until('!!document.querySelector(".sl-name.fade-text-overflow")','overflowing session title rendered');
  const measurements=[];
  for(const height of [1050,480,1050]) {
    await send('Emulation.setDeviceMetricsOverride',{width:1200,height,deviceScaleFactor:1,mobile:false});
    await sleep(200);
    measurements.push(await js(`(()=>{const scroll=document.querySelector('.sl-scroll'),row=document.querySelector('.sl-item'),title=row.querySelector('.sl-name');return {row:row.getBoundingClientRect().width,title:title.getBoundingClientRect().width,scrolling:scroll.scrollHeight>scroll.clientHeight,gutter:scroll.offsetWidth-scroll.clientWidth,mask:getComputedStyle(title).maskImage}})()`));
  }
  console.log(JSON.stringify({measurements}));
  assert.equal(measurements[0].scrolling,false,'tall window fits the list');
  assert.equal(measurements[1].scrolling,true,'short window needs a scrollbar');
  assert.equal(measurements[0].row,measurements[1].row,'height-only resize must not change row width');
  assert.equal(measurements[0].title,measurements[1].title,'title fade keeps the same endpoint');
  assert.deepEqual(measurements[0],measurements[2],'restoring height preserves layout');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['stable list width across overflow threshold','stable title fade','round trip resize']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
