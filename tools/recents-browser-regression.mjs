// Mobile recents gestures and stall diagnostics; no live backend.
// Run: node tools/recents-browser-regression.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}.sessions-split{position:relative;height:100dvh}.sessions-pane,.content-pane{position:absolute;inset:0;display:flex;flex-direction:column;background:white}.sessions-pane{z-index:2}.sheet-closed,.sheet-covered{visibility:hidden}.sl-scroll,.start-chat{overflow:auto;flex:1;min-height:0}.row{display:block;height:60px}header{height:60px}</style><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {createRouter,createMemoryHistory,useRoute} from 'vue-router';
import {useRecentsSheet} from '/src/features/sessions/useRecentsSheet.ts';
import {installScrollStallLog,stalls,noteTouchAction} from '/src/ui/scrollStalls.ts';installScrollStallLog();window.stalls=stalls;window.noteTouchAction=noteTouchAction;
const Shell = {
  setup() {
    const split = ref(null), route = useRoute();
    useRecentsSheet(split);
    window.fixture = { go: path => router.push(path), route };
    const rows = (count, recent = false) => Array.from({ length: count }, (_, index) =>
      h('a', { class: 'row', href: '#', onClick: event => {
        event.preventDefault(); window.clicked = index;
      } }, (recent ? 'Recent ' : 'Session ') + index));
    return () => h('div', { ref: split, class: 'sessions-split' }, [
      h('div', { id: 'session-list', class: ['sessions-pane', route.name !== 'all-sessions' ? 'sheet-closed' : ''] }, [
        h('header', 'All sessions'), h('div', { class: 'sl-scroll' }, rows(24)),
      ]),
      h('div', { class: ['content-pane', route.name === 'all-sessions' ? 'sheet-covered' : ''] }, [
        h('div', { class: 'start-chat' }, [
          h('header', 'Home'), h('section', { class: 'recent-sessions' }, [h('h2', 'Recent'), ...rows(5, true)]),
        ]),
      ]),
    ]);
  },
};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',redirect:'/sessions'},{path:'/sessions',name:'sessions',component:Shell},{path:'/sessions/all',name:'all-sessions',component:Shell},{path:'/chat',name:'chat',component:Shell}]});
const app=createApp(Shell).use(router);await router.push('/sessions');await router.isReady();app.mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, define: {__WEB_BUILD_ID__: JSON.stringify('regression-build')}, root: process.cwd(), plugins: [vue(), {
  name: 'recents-regression', configureServer(server) { server.middlewares.use('/__recents_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__recents_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/sessions/useRecentsSheet.ts'], include: ['vue', 'motion-v', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-recents-browser-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__recents_regression`});
  await until('!!window.fixture','sheet mounted');
  const swipe=async(from,to)=>{
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:from}]});
    for(let n=1;n<=12;n++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y:from+(to-from)*n/12}]});await sleep(17);}
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(750);
  };
  const state=()=>js(`({route:fixture.route.name,scroll:document.querySelector('.sl-scroll').scrollTop,pane:document.querySelector('#session-list').getAttribute('style'),page:document.querySelector('.content-pane').getAttribute('style'),inert:[...document.querySelectorAll('[inert]')].map(e=>e.className)})`);
  await sleep(2200);
  await swipe(350,100);
  assert.equal((await state()).route,'all-sessions','swipe opens full list');
  await swipe(500,180);
  assert.ok(await js("document.querySelector('.sl-scroll').scrollTop>100"),'opened list scrolls');
  assert.deepEqual(await js('JSON.parse(JSON.stringify(window.stalls.value))'),[],'successful sheet navigation is not a scroll stall');
  await js("fixture.go('/sessions')");await sleep(50);
  await swipe(350,100);
  assert.equal((await state()).route,'all-sessions','opening can interrupt a closing animation');
  await js("fixture.go('/chat')");await sleep(50);await js("fixture.go('/sessions/all')");await sleep(600);
  assert.equal(await js("document.querySelector('#session-list').inert"),false,'returning list remains interactive');
  await js("document.querySelector('.sl-scroll').scrollTop=0");await sleep(150);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:90}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(400);
  assert.equal(await js('window.clicked'),0,'a list row still answers taps');
  // Deliberately strand a gesture: successful actions alone should be excluded, never all drags.
  await js(`const list=document.querySelector('.sl-scroll');list.addEventListener('touchmove',event=>{event.preventDefault();event.stopPropagation()},{passive:false});list.addEventListener('touchend',()=>window.noteTouchAction('unfinished test action',()=>false));`);
  await sleep(2100);await swipe(500,180);
  const recorded=await js('JSON.parse(JSON.stringify(window.stalls.value))');
  assert.equal(recorded.length,1,'a genuinely blocked scroll is still recorded');
  assert.equal(recorded[0].build,'regression-build','record identifies the running bundle');
  assert.equal(recorded[0].gestureAction,'unfinished test action');
  assert.ok(!recorded[0].inertAncestor,'hidden inert home does not imply the list is inert');
  assert.ok(!recorded[0].layers.some(layer=>layer.startsWith('inert')),'hidden inert surfaces are excluded');
  assert.match(recorded[0].moves,/^[1-9]\d* cancelled, [1-9]\d* stopped/,'cancelled moves counted even when propagation stops');
  assert.ok(recorded[0].movement.y<0,'swipe direction is preserved');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await sleep(100);
  assert.equal(await js("document.querySelectorAll('[inert]').length"),0,'desktop clears mobile inert state');
  assert.deepEqual(exceptions,[],'no runtime exceptions');
  console.log(JSON.stringify({ok:true,checks:['sheet navigation','native scrolling','interrupted transition','route return and taps','no false stall','blocked scroll still captured','build and cancellation evidence','desktop cleanup']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
