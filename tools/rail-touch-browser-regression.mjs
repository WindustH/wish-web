// Isolated account and fetch settings regression; uses synthetic credentials, never a live backend.
// Run: node tools/accounts-browser-regression.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {TooltipProvider} from 'reka-ui';
import ActivityRail from '/src/features/sessions/ActivityRail.vue';
import {useRailSwipe} from '/src/features/sessions/useRailSwipe.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/features.css';
window.opened=0;
createApp({setup(){const wrap=ref(null),scroll=ref(null),content=ref(null);useRailSwipe({wrap,scroll,content,enabled:ref(true)});
 const rows=[{top:100,height:400,events:[{chipKey:'one',stepKey:'one',icon:'terminal',failed:false,warn:false,tip:'Shell'}]}];
 return()=>h(TooltipProvider,{},()=>h('div',{ref:wrap,class:'chatlog-wrap',style:'height:600px;width:390px'},[
 h('div',{ref:scroll,class:'chatlog',style:'height:600px;overflow:auto'},[
 h('div',{ref:content,class:'chatlog-content',style:'height:1800px'},[h(ActivityRail,{rows,total:1800,visible:true,onOpen:()=>window.opened++})])])]))}}).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__delivery_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__delivery_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/settings/ToolSwitchRows.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-delivery-browser-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__delivery_regression`});
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
  await touch([point]);
  assert.equal(await js('window.opened'),1,'native touch activates exactly once');
  await touch([point,{x:point.x,y:point.y+4}]);
  assert.equal(await js('window.opened'),2,'minor finger movement still taps once');
  await touch([point,{x:point.x,y:point.y+40}]);
  assert.equal(await js('window.opened'),2,'vertical drag must not activate');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['native rail tap','no duplicate click','finger tremor','scroll does not activate']}));
} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
