// Readable reasoning summaries must survive stored history and open from the real timeline.
// Run: node tools/reasoning-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = String.raw`<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import {TooltipProvider} from 'reka-ui';
import ChatLog from '/src/features/sessions/ChatLog.vue';
import {chat} from '/src/core/state/chatSlice.ts';
import {entryView} from '/src/core/api/projections.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {applyTokens} from '/src/ui/applyTokens.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/layout.css';import '/src/styles/features.css';
registerBrowserPlatform({namespace:'wish-reasoning-regression',version:1});applyTokens();
chat.sessionId.value='fixture';chat.loadingInitial.value=false;chat.hasMoreBefore.value=false;
const project=(seq,reasoning)=>entryView({record:{sequence:seq,recorded_at:0,model_call_id:1},content:{kind:'message',value:{id:seq,origin:'Model',message:{Reasoning:reasoning}}}},'fixture');
function load(reasoning,proof=false){
 const stored=JSON.parse(JSON.stringify(reasoning));
 chat.entries.value=[{seq:1,id:1,kind:'user_message',payload:{content:[{type:'text',text:'Test reasoning summary'}]}},project(2,stored),...(proof?[project(3,{plaintext:'',display:'',signature:'opaque-proof'})]:[]),{seq:4,id:4,kind:'assistant_message',payload:{content:[{type:'text',text:'The final answer.\n\n'+('Answer paragraph.\n\n'.repeat(12))}]}}];
}
load({plaintext:'',display:'**Gemini** summary text',signature:'opaque-proof'});
window.fixture={load,chat};
createApp({render:()=>h(TooltipProvider,{},()=>h('main',{style:'height:100vh;display:flex;flex-direction:column'},[h(ChatLog,{sessionId:'fixture',mobile:false})]))}).use(createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]})).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'reasoning-dialog-regression',
  resolveId(id) { if(id==='virtual:pwa-register') return '\0fixture-pwa-register'; },
  load(id) { if(id==='\0fixture-pwa-register') return 'export const registerSW = () => async () => {};'; }, configureServer(server) { server.middlewares.use('/__reasoning_dialog', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__reasoning_dialog', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/sessions/ChatLog.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-reasoning-dialog-'));
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
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await js(expression))return;await sleep(100);}throw Error(label+' '+JSON.stringify({exceptions,dom:await js('document.body.innerHTML.slice(-2000)'),fixture:await js('!!window.fixture')}));};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:844,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__reasoning_dialog`});
  await until('!!document.querySelector(".history-rail-node")','timeline mounted');
  const click=async (selector,corner=false)=>{
    const point=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:r.x+${corner?5:"r.width/2"},y:r.y+${corner?5:"r.height/2"}};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  const key=async key=>{
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});
  };
  const samples=[
    {name:'Gemini',reasoning:{plaintext:'Gemini summary text',display:'Gemini summary text',signature:'opaque-proof'},text:'Gemini summary text'},
    {name:'Gemini Interactions',reasoning:{plaintext:'First.\nSecond.',display:'First.\nSecond.',replay_item:{type:'thought',summary:[{type:'text',text:'First.'},{type:'text',text:'Second.'}],signature:'opaque-proof'}},text:'First.\nSecond.'},
    {name:'Claude',reasoning:{plaintext:'Claude thinking text',display:'Claude thinking text',signature:'opaque-proof'},text:'Claude thinking text'},
    {name:'GPT',reasoning:{plaintext:'',display:'GPT summary text',ciphertext:'opaque-proof'},text:'GPT summary text'},
    {name:'Gemini summary with separate proof',reasoning:{plaintext:'Gemini retained summary',display:'Gemini retained summary'},text:'Gemini retained summary',proof:true},
    {name:'GPT pure ciphertext',reasoning:{plaintext:'',display:'',ciphertext:'opaque-proof'},text:''},
  ];
  for(const sample of samples){
    await js(`fixture.load(${JSON.stringify(sample.reasoning)},${!!sample.proof})`);
    await until(`!!document.querySelector('.history-rail-node[data-seq="2"]')`,'reasoning icon for '+sample.name);
    await sleep(180);
    await click('.history-rail-node[data-seq="2"]');
    await until('!!document.querySelector(".reasoning-document, .process-window")','reasoning detail or gathered timeline opens');
    if(!await js('!!document.querySelector(".reasoning-document")')){
      await click('.process-window .proc-event-button[data-seq="2"]');
    }
    await until('!!document.querySelector(".reasoning-document")','clicked timeline opens reasoning detail');
    const text=await js('document.querySelector(".reasoning-document").textContent.trim()');
    if(sample.text)assert.equal(text.replace(/\s+/g,' '),sample.text.replace(/\s+/g,' '),sample.name+' shows the retained readable summary');
    else assert.match(text,/没有可显示的文本|no displayable text/,'pure ciphertext still has an empty detail');
    assert.ok(!text.includes('opaque-proof'),'signature and ciphertext are never shown as text');
    await click('.process-detail-heading > button:last-child');
    await until('!document.querySelector(".reasoning-document")','reasoning detail closes');
    if(await js('!!document.querySelector(".process-window")')){
      await key('Escape');
      await until('!document.querySelector(".process-window")','gathered timeline closes');
    }
  }
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:samples.map(sample=>sample.name)}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
