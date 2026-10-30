// Rail touch activation and stall diagnostics, without a live backend.
// Run: node tools/rail-touch-browser-regression.mjs (CHROME may override the executable).
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
import {installScrollStallLog,stalls} from '/src/domain/diagnostics/scrollStalls.ts';
installScrollStallLog();window.stalls=stalls;
import Modal from '/src/ui/components/Modal.vue';
import ActivityRail from '/src/features/sessions/ActivityRail.vue';
import {useRailSwipe} from '/src/features/sessions/useRailSwipe.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/features.css';
window.opened=0;
createApp({setup(){const wrap=ref(null),scroll=ref(null),content=ref(null);useRailSwipe({wrap,scroll,content,enabled:ref(true)});
 const rows=ref([{top:100,height:400,events:[{chipKey:'one',stepKey:'one',icon:'terminal',failed:false,warn:false,tip:'Shell'}]}]);window.railRows=rows;
 return()=>h(TooltipProvider,{},()=>h('div',{ref:wrap,class:'chatlog-wrap',style:'height:600px;width:390px'},[
 h('div',{ref:scroll,class:'chatlog',style:'height:600px;overflow:auto'},[
 h('div',{ref:content,class:'chatlog-content',style:'height:1800px'},[h(ActivityRail,{rows:rows.value,total:1800,visible:true,onOpen:()=>window.opened++})])])]))}}).mount('#app');
const mount=document.createElement('div');document.body.append(mount);
const dialogOpen=ref(false);window.dialogOpen=dialogOpen;
createApp({setup(){return()=>h(Modal,{open:dialogOpen.value,title:'Close lifecycle',onClose:()=>dialogOpen.value=false},()=>h('p','Dialog content'))}}).mount(mount);
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__rail_touch_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__rail_touch_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/sessions/ActivityRail.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-rail-touch-browser-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__rail_touch_regression`});
  await until('!!document.querySelector(".history-rail-node")','rail mount');
  async function touch(points) {
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points[0]]});
    for(const point of points.slice(1)) { await sleep(30); await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]}); }
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await sleep(350);
  }
  await touch([{x:150,y:300},{x:175,y:300},{x:200,y:300}]);
  await until('document.querySelector(".chatlog-wrap").classList.contains("rail-out")','open rail');
  const point=await js('(()=>{const r=document.querySelector(".history-rail-node").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await sleep(2100);
  await touch([point]);
  assert.equal(await js('window.opened'),1,'native touch activates exactly once');
  assert.deepEqual(await js('stalls.value.length'),0,'successful synchronous click must not be logged as missing');
  await js(`(() => {
    const button = document.createElement('button');
    button.id = 'changing-icon';
    button.style.cssText = 'position:fixed;left:100px;top:40px;width:100px;height:40px;z-index:999';
    button.innerHTML = '<svg width="32" height="32"><circle cx="16" cy="16" r="14"/></svg>';
    button.addEventListener('click', () => { button.innerHTML = '<span>Sending</span>'; });
    document.body.append(button);
  })()`);
  await touch([{x:150,y:60}]);
  assert.equal(await js('document.querySelector("#changing-icon").textContent'), 'Sending');
  assert.equal(await js('stalls.value.length'), 0, 'successful click with replaced SVG must not be reported');
  await js('document.querySelector("#changing-icon").remove()');
  await touch([point,{x:point.x,y:point.y+4}]);
  assert.equal(await js('window.opened'),2,'minor finger movement still taps once');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await js(`railRows.value=[{...railRows.value[0],events:[{...railRows.value[0].events[0],chipKey:'replacement',stepKey:'replacement'}]}]`);
  await sleep(50);
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(350);
  assert.equal(await js('window.opened'),2,'a node replaced during a press must not open the replacement');
  await touch([point,{x:point.x,y:point.y+40}]);
  assert.equal(await js('window.opened'),2,'vertical drag must not activate');
  // Simulate a suspended exit animation, as can happen when a mobile browser loses foreground.
  await js(`(()=>{const style=document.createElement('style');style.textContent='.modal-card[data-state="closed"],.modal-overlay[data-state="closed"]{animation-duration:10s!important;animation-play-state:paused!important}';document.head.append(style);dialogOpen.value=true})()`);
  await until('!!document.querySelector(".modal-card")','real modal opens');
  assert.equal(await js('document.body.style.pointerEvents'),'','dialog uses its overlay without a document lock');
  await js(`document.querySelector('.modal-head button').click()`);
  await sleep(400);
  assert.equal(await js('document.querySelectorAll(".modal-card,.modal-overlay").length'),0,'completed close unmounts its owned layer');
  assert.notEqual(await js('document.body.style.pointerEvents'),'none','completed close releases page pointer lock');
  await touch([point]);
  assert.equal(await js('window.opened'),3,'page remains interactive after close');
  await js(`(()=>{const button=document.createElement('button');button.textContent='broken';button.style.cssText='position:fixed;left:100px;top:40px;width:100px;height:40px;z-index:999';button.addEventListener('touchend',event=>event.preventDefault());document.body.append(button)})()`);
  await touch([{x:140,y:60}]);
  await until('stalls.value.length===1','genuinely missing click is still recorded');
  assert.equal(await js('stalls.value[0].click'),'none came');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['native rail tap','no duplicate click','finger tremor','scroll does not activate']}));
} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
