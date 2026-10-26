// Session range selection and recovery controls with real Vue components.
// Run: node tools/selection-retry-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {TooltipProvider} from 'reka-ui';
import {createRouter,createMemoryHistory} from 'vue-router';
import {useKeyboardScope} from '/src/ui/composables/useKeyboardScope.ts';
import SessionList from '/src/features/sessions/SessionList.vue';
import ErrorEntry from '/src/features/sessions/entries/ErrorEntry.vue';
import RetryStatus from '/src/features/sessions/RetryStatus.vue';
import {sessions} from '/src/core/state/sessionsSlice.ts';import {chat} from '/src/core/state/chatSlice.ts';
import {sessionView,entryView} from '/src/core/api/projections.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/layout.css';import '/src/styles/features.css';
registerBrowserPlatform();
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});await router.push('/s/s1');
let sessionCount=5;
const rawFetch=window.fetch;
window.fetch=async(input,opts)=>{
 const url=String(input);
 if(url.includes('/conversations'))return new Response(JSON.stringify({items:Array.from({length:sessionCount},(_,i)=>({kind:'session',session:{id:'s'+i,name:'Session '+i,updated_at:Date.now(),metadata:{}},status:{phase:'Idle',running:false,config:{}}})),next:null}),{headers:{'content-type':'application/json'}});
 if(url.endsWith('/folders'))return new Response('[]',{headers:{'content-type':'application/json'}});
 return rawFetch(input,opts);
};
await sessions.loadFirst();
const failure={family:'Transport',message:'Connection lost'};
chat.sessionId.value='s1';chat.snapshot.value=sessionView({session:{id:'s1'},status:{config:{},phase:'Suspended',running:false,state:{Suspended:{outcome:24}}}});
chat.entries.value=[entryView({record:{sequence:29,item:{Event:24},recorded_at:0},content:{kind:'event',value:{Finished:{Failed:{Transport:{retryable:true,message:'Connection lost'}}}}}},'s1')];
let runs=0;chat.retryRun=async()=>{runs++;chat.snapshot.value={...chat.snapshot.value,running:true};};
const handled={region:0,parent:0};
const Region={setup(){const root=ref(null);useKeyboardScope(root,event=>{if(event.key!=='Escape')return false;handled.region++;return true;});return()=>h('div',{ref:root,id:'other-region',tabindex:-1},[h('input',{id:'consuming-control',onKeydown:event=>event.preventDefault()})]);}};
const Parent={setup(){const root=ref(null);useKeyboardScope(root,()=>{handled.parent++;return true;});return()=>h('div',{ref:root},[h(Region)]);}};
window.fixture={router,chat,sessions,handled,async loadMany(){sessionCount=45;await sessions.refresh();},get runs(){return runs;}};
createApp({render:()=>h(TooltipProvider,null,{default:()=>[
 h(Parent),
 h('div',{style:'width:350px;height:700px;display:flex;'},[h(SessionList)]),
 h(ErrorEntry,{item:{entry:chat.entries.value[0]},session:'s1'}),
 h(RetryStatus,{retries:[{requestId:'r',operation:'model',retry:1,maxRetries:5,phase:'waiting',retryAt:Date.now()+5000,failure}]})
]})}).use(router).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {name:'pwa-fixture',resolveId(id){if(id==='virtual:pwa-register')return id;},load(id){if(id==='virtual:pwa-register')return 'export const registerSW=()=>()=>{}';}}, {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__selection_retry', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__selection_retry', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/settings/ToolSwitchRows.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-selection-retry-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__selection_retry`});
  await until('!!window.fixture && document.querySelectorAll(".sl-row").length===5','session list mounted');
  await js(`document.querySelector('[data-session-id="s1"] .sl-row').click()`);
  await js(`document.querySelector('[data-session-id="s3"] .sl-row').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,shiftKey:true}))`);
  await until('document.querySelectorAll(".sl-item.chosen").length===3','Shift selects an inclusive range');
  assert.equal(await js('fixture.router.currentRoute.value.path'),'/s/s1','Shift must not navigate');
  assert.deepEqual(await js('Array.from(document.querySelectorAll(".sl-item.chosen")).map(e=>e.dataset.sessionId)'),['s1','s2','s3']);
  await js(`document.querySelector('[data-session-id="s0"] .sl-row').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,shiftKey:true}))`);
  await until('document.querySelectorAll(".sl-item.chosen").length===4','reverse Shift range');
  await js(`document.querySelector('#other-region').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await js('fixture.handled.region'),1,'focused region owns Escape');
  assert.equal(await js('fixture.handled.parent'),0,'handled child command does not reach parent');
  assert.equal(await js('!!document.querySelector(".sl-select-bar")'),true,'another region does not cancel list selection');
  await js(`document.querySelector('#consuming-control').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await js('fixture.handled.region'),1,'control consumed event does not run region command');
  await js(`document.querySelector('#other-region').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true}))`);
  assert.equal(await js('fixture.handled.region'),1,'IME is not a region command');
  await js(`const hiddenDialog=document.createElement('div');hiddenDialog.setAttribute('role','dialog');hiddenDialog.style.display='none';document.body.append(hiddenDialog);`);
  await js(`const visibleDialog=document.createElement('div');visibleDialog.id='active-dialog';visibleDialog.setAttribute('role','dialog');visibleDialog.textContent='Open dialog';visibleDialog.tabIndex=-1;document.body.append(visibleDialog);visibleDialog.focus();`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await js('!!document.querySelector(".sl-select-bar")'),true,'visible dialog takes priority over selection');
  await js(`document.querySelector('#active-dialog').remove();document.querySelector('.sessions-pane').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until('!document.querySelector(".sl-select-bar") && document.querySelectorAll(".sl-item.chosen").length===0','Escape exits selection and clears chosen rows');
  await until('!!document.querySelector(".retry-run")','current transport failure offers retry');
  assert.equal(await js('getComputedStyle(document.querySelector(".upstream-retry")).backgroundColor'),'rgb(54, 48, 32)','automatic retry uses warning background');
  await js('document.querySelector(".retry-run").click()');
  await until('!document.querySelector(".retry-run")','running session hides retry');
  assert.equal(await js('fixture.runs'),1);
  await js('fixture.chat.snapshot.value={...fixture.chat.snapshot.value,running:false,last_error:null,status:{state:{Suspended:{outcome:30}}}}');
  await sleep(50);assert.equal(await js('!!document.querySelector(".retry-run")'),false,'old failure cannot retry after success');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const point=async id=>js(`(()=>{const r=document.querySelector('[data-session-id="${id}"] .sl-row').getBoundingClientRect();return {x:r.left+60,y:r.top+r.height/2}})()`);
  const touch=async(type,position)=>send('Input.dispatchTouchEvent',{type,touchPoints:position?[{...position,id:1,radiusX:2,radiusY:2}]:[]});
  await js(`document.querySelector('[data-session-id="s1"] .sl-row').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,shiftKey:true}))`);
  const start=await point('s2'),finish=await point('s4');
  await touch('touchStart',start);await sleep(520);
  await until('!!document.querySelector(".sl-range-selecting")','hold activates range selection');
  await touch('touchMove',finish);
  await until('document.querySelectorAll(".sl-item.chosen").length===4','held touch selects continuous range');
  await touch('touchMove',start);
  await until('document.querySelectorAll(".sl-item.chosen").length===2','reversing contracts range and retains baseline');
  await touch('touchEnd');await sleep(100);
  assert.equal(await js('document.querySelectorAll(".sl-item.chosen").length'),2,'release must not toggle anchor');
  await touch('touchStart',await point('s0'));await touch('touchEnd');
  await until('document.querySelectorAll(".sl-item.chosen").length===3','ordinary tap still toggles');
  await touch('touchStart',await point('s2'));await sleep(520);
  await until('document.querySelectorAll(".sl-item.chosen").length===2','holding selected anchor deselects it');
  await touch('touchMove',await point('s4'));
  assert.deepEqual(await js('Array.from(document.querySelectorAll(".sl-item.chosen")).map(e=>e.dataset.sessionId)'),['s0','s1'],'deselect gesture does not select previously unselected rows');
  await touch('touchMove',await point('s1'));
  await until('document.querySelectorAll(".sl-item.chosen").length===1','dragging over selected rows deselects the range');
  await touch('touchMove',await point('s2'));
  await until('document.querySelectorAll(".sl-item.chosen").length===2','reversing deselection restores baseline outside range');
  await touch('touchEnd');await sleep(100);
  assert.deepEqual(await js('Array.from(document.querySelectorAll(".sl-item.chosen")).map(e=>e.dataset.sessionId)'),['s0','s1'],'release preserves deselection and unrelated selection');
  await js(`fixture.loadMany()`);
  await sleep(150);
  await touch('touchStart',await point('s2'));await sleep(520);
  const edge=await js(`(()=>{const r=document.querySelector('.sl-scroll').getBoundingClientRect();return {x:r.left+60,y:r.bottom-4}})()`);
  await touch('touchMove',edge);await sleep(850);
  assert.ok(await js('document.querySelector(".sl-scroll").scrollTop')>100,'edge hold scrolls virtual list');
  assert.ok(await js('document.querySelector(".sl-chosen-full").textContent.match(/[0-9]+/)[0]*1')>8,'range includes virtual rows during scroll');
  await touch('touchCancel');
  const stopped=await js('document.querySelector(".sl-scroll").scrollTop');await sleep(150);
  assert.equal(await js('document.querySelector(".sl-scroll").scrollTop'),stopped,'cancel stops auto scroll');
  assert.equal(await js('!!document.querySelector(".sl-range-selecting")'),false);
  const beforeSwipe=await js('document.querySelector(".sl-chosen-full").textContent');
  const swipe=await js(`(()=>{const r=document.querySelector('.sl-scroll').getBoundingClientRect();return {x:r.left+80,y:r.top+150}})()`);
  const scrollBeforeSwipe=await js('document.querySelector(".sl-scroll").scrollTop');
  await touch('touchStart',swipe);await touch('touchMove',{x:swipe.x,y:swipe.y-60});await touch('touchEnd');
  await until('document.querySelector(".sl-scroll").scrollTop>'+scrollBeforeSwipe,'quick swipe retains native scrolling');
  assert.equal(await js('document.querySelector(".sl-chosen-full").textContent'),beforeSwipe,'quick swipe does not select');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['selected anchor deselects range','deselection reversal restores baseline','touch hold range and reversal','virtual list edge scrolling','touch cancellation','tap and native swipe preserved','focused regions stay independent','child control consumption','IME isolation','Escape exits selection','native suspended outcome resolves retry','Shift range selection','no Shift navigation','retry visibility','automatic retry warning']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
