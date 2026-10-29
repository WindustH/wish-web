// Information overview and embedded history search in a real browser.
// Run: node tools/info-search-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {TooltipProvider} from 'reka-ui';
import {createRouter,createMemoryHistory} from 'vue-router';
import SessionSettingsPane from '/src/features/sessions/SessionSettingsPane.vue';
import InfoPane from '/src/features/sessions/InfoPane.vue';
import {chat} from '/src/core/state/chatSlice.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/layout.css';import '/src/styles/features.css';
registerBrowserPlatform({ namespace: 'wish-webui', version: 1 });
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push('/s/fixture/info');
const rawFetch=window.fetch;
window.fetch=async(input,options)=>{
 const url=String(input);const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
 if(url.includes('/history/search'))return response({items:[{record:{sequence:42,recorded_at:0},message_type:'user',snippet:'matched history message'}],has_more:false});
 if(url.endsWith('/defaults'))return response({session_config:{},defaults:{}});
 if(url.endsWith('/config'))return response({config:{shell:{program:'',args:null}}});
 if(url.endsWith('/shells'))return response({default:{program:'/bin/sh',args:[]},shells:[]});
 if(url.endsWith('/search/providers'))return response({available:false,providers:[]});
 if(url.endsWith('/groups'))return response([]);
 if(url.endsWith('/providers'))return response({providers:[]});
 if(url.endsWith('/usage'))return response({statistics:{totals:{tokens:{}},model_attempts:0}});
 if(url.includes('/usage/'))return new Response('unavailable',{status:503});
 return rawFetch(input,options);
};
chat.sessionId.value='fixture';chat.snapshot.value={id:'fixture',name:'Information test',phase:'idle',config:{}};
let located=null;chat.locate=async(sid,seq)=>{located={sid,seq};return true;};
const initial=ref('overview'),open=ref(true),settings=ref(false);
window.fixture={open,initial,settings,get located(){return located;}};
createApp({render:()=>h(TooltipProvider,null,{default:()=>open.value?h(settings.value?SessionSettingsPane:InfoPane,{initialSection:initial.value,onClose:()=>open.value=false}):null})}).use(router).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, define:{__BUILD_ID__:JSON.stringify('info-search-test')}, root: process.cwd(), plugins: [vue(), {name:'pwa-fixture',resolveId(id){if(id==='virtual:pwa-register')return id;},load(id){if(id==='virtual:pwa-register')return 'export const registerSW=()=>()=>{}';}}, {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__info_search', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__info_search', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/tool-settings/ToolSwitchRows.vue'], include: ['echarts/charts', 'echarts/components', 'echarts/core', 'echarts/renderers', 'vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-info-search-'));
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
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await js(expression))return;await sleep(100);}throw Error(label+' '+JSON.stringify({exceptions,dom:await js('document.body.innerHTML.slice(0,1500)'),fixture:await js('!!window.fixture')}));};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__info_search`});
  await until('!!window.fixture && !!document.querySelector(".info-hero")','information overview mounted');
  assert.equal(await js('document.querySelectorAll("[role=dialog]").length'),1);
  await js(`Array.from(document.querySelectorAll('.info-sections button')).find(button=>button.textContent.includes('搜索')).click()`);
  await until('!!document.querySelector(".search-row input")','search is inside information');
  assert.equal(await js('document.querySelectorAll("[role=dialog]").length'),1,'search must not open a second modal');
  await until('document.activeElement===document.querySelector(".search-row input")','desktop search focuses input');
  await js(`const input=document.querySelector('.search-row input');input.value='history';input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await until('!!document.querySelector(".search-result")','embedded search returns results');
  await js(`document.querySelector('.search-result').click()`);
  await until('fixture.open.value===false','search jump closes information');
  assert.deepEqual(await js('fixture.located'),{sid:'fixture',seq:42});
  await sleep(300);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await js(`fixture.initial.value='search';fixture.open.value=true`);
  await until('!!document.querySelector(".modal-page .search-row input")','mobile search deep link opens information search section');
  assert.equal(await js('document.querySelectorAll("[role=dialog]").length'),1);
  await js(`Array.from(document.querySelectorAll('.info-sections button')).find(button=>button.textContent.includes('概览')).click()`);
  await until('!!document.querySelector(".info-hero")','mobile can return to overview within information');
  await js('fixture.open.value=false');await sleep(300);
  for(const width of [1200,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<900});
    await js('fixture.settings.value=true;fixture.open.value=true');
    await until('!!document.querySelector(".session-settings-window")','session settings mounted');
    await js(`Array.from(document.querySelectorAll('.session-settings-window button')).find(button=>button.textContent.trim()==='清空').click()`);
    await until('document.querySelectorAll("[role=dialog]").length===2','clear confirmation opens above settings');
    await sleep(350);
    const box=await js(`(()=>{const el=Array.from(document.querySelectorAll('[role=dialog]')).find(el=>el.textContent.includes('清空当前上下文？'));const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,anchored:el.classList.contains('anchored-modal'),overlay:document.querySelectorAll('.modal-overlay').length}})()`);
    assert.equal(box.anchored,false,'confirmation must not inherit panel positioning');
    assert.ok(Math.abs(box.x-width/2)<2 && Math.abs(box.y-422)<2,'confirmation centered in viewport');
    assert.ok(box.overlay>0,'confirmation has modal overlay');
    await js(`Array.from(document.querySelectorAll('[role=dialog]')).find(el=>el.textContent.includes('清空当前上下文？')).querySelector('.modal-actions button').click()`);
    await until('document.querySelectorAll("[role=dialog]").length===1','cancel closes only confirmation');
    await js('fixture.open.value=false');await sleep(350);
  }
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['one information surface','embedded search results','result location and close','desktop focus','mobile direct search and overview','desktop/mobile confirmation centering and cancellation']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
