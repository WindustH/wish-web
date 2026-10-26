// Recorded Ask User questions, original options and answers in a stable detail host.
// Run: node tools/question-detail-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref,provide} from 'vue';import {TooltipProvider} from 'reka-ui';
import QuestionCard from '/src/features/sessions/entries/QuestionCard.vue';
import ActivityDialogs from '/src/features/sessions/ActivityDialogs.vue';
import {openActivityKey} from '/src/features/sessions/activityDialogs.ts';
import {chat} from '/src/core/state/chatSlice.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/features.css';
const item=ref({type:'question',key:'question-1',callId:'ask-1',arguments:{questions:[
 {type:'choice',question:'Which platforms?',options:[{label:'Linux',description:'Desktop Linux'},{label:'macOS',description:'Apple desktop'},{label:'Windows',description:'Windows desktop'}],multi_select:true,allow_other:true},
 {type:'text',question:'Additional notes?'},{type:'text',question:'Optional question?'}]},
 result:{payload:{result:{status:'success',output:{status:'answered',answers:[
 {type:'choice',selected:['Linux','Windows'],other:'FreeBSD'},{type:'text',text:'Keep the current theme.'},{type:'text',skipped:true}]}}}},late:null});
const visible=ref(true),request=ref(null);let tick=0;
window.fixture={item,visible,request,chat};
createApp({setup(){provide(openActivityKey,value=>request.value={...value,requestId:++tick});return()=>h(TooltipProvider,{},()=>[
 visible.value?h(QuestionCard,{item:item.value}):null,
 h(ActivityDialogs,{chips:[],request:request.value,session:'fixture',onDismiss:()=>request.value=null})]);}}).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {name:'pwa-fixture',resolveId(id){if(id==='virtual:pwa-register')return id;},load(id){if(id==='virtual:pwa-register')return 'export const registerSW=()=>()=>{}';}}, {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__question_detail', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__question_detail', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/sessions/entries/FileChangeCards.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-question-detail-'));
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
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__question_detail`});
  await until('!!document.querySelector(".question-detail-open")','answered card can open details');
  await js('document.querySelector(".question-card").click()');
  await until('!!document.querySelector(".question-detail-window")','clicking the card opens details');
  assert.equal(await js('document.querySelectorAll(".recorded-options li").length'),3,'all original options remain visible');
  assert.equal(await js('document.querySelectorAll(".recorded-options li.selected").length'),2,'selected options are marked');
  const text=await js('document.querySelector(".question-detail-window").textContent');
  for(const value of ['Which platforms?','Apple desktop','FreeBSD','Keep the current theme.','未回答'])assert.ok(text.includes(value),value);
  await js('fixture.visible.value=false');
  assert.ok(await js('!!document.querySelector(".question-detail-window")'),'virtual row removal keeps details open');
  await js('document.querySelector(".question-detail-window .dialog-toolbar button").click()');
  await until('!document.querySelector("[role=dialog]")','detail closes');
  await js('fixture.visible.value=true;fixture.item.value.result=null;fixture.chat.stream.value={...fixture.chat.stream.value,active:true}');
  await until('!!document.querySelector(".question-card.answerable")','pending question retains its form');
  assert.equal(await js('!!document.querySelector(".question-detail-open")'),false,'pending form does not become a history dialog');
  await js('document.querySelector(".question-option").click()');
  assert.ok(await js('document.querySelector(".question-option").classList.contains("picked")'),'pending choice still works');
  assert.equal(await js('!!document.querySelector("[role=dialog]")'),false);
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['original questions and options','multiple and custom answers','unanswered question','stable detail host','pending form preserved']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
