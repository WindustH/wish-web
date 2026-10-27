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
import {deliveriesList} from '/src/core/api/endpoints.ts';
import ToolSwitchRows from '/src/ui/domain/settings/ToolSwitchRows.vue';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {createBackLayers,setBackLayers} from '/src/ui/backLayers.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/ui/domain/settings/settings.css';
registerBrowserPlatform({ namespace: 'wish-webui', version: 1 });setBackLayers(createBackLayers(window));
const tools=ref({shell:true,ask_user:true,web_fetch:true,web_search:true,mcp:true,skills:true,sessions:true});
createApp({setup(){return()=>h(TooltipProvider,{},()=>h('main',{style:'padding:16px;width:min(800px,100%);margin:auto'},[h('div',{class:'set-card'},[h(ToolSwitchRows,{modelValue:tools.value,'onUpdate:modelValue':v=>tools.value=v,searchAvailable:true})])]))}}).mount('#app');
window.fixture={tools};
window.readQueue=async()=>{
 const original=window.fetch,calls=[];
 window.fetch=async(input)=>{
  const url=new URL(String(input),location.href);
  let body;
  if(url.pathname.endsWith('/queue'))body={items:[12,10,11,95,98],next:5};
  else if(url.pathname.endsWith('/entries')){
   const start=Number(url.searchParams.get('start')),limit=Number(url.searchParams.get('limit'));calls.push([start,limit]);
   body={items:Array.from({length:limit},(_,i)=>({message:{User:{content:[{Text:{text:'Entry '+(start+i)}}],metadata:start+i===98?{source:'internal'}:{}}}}))};
  } else body={session:{id:'batch',name:'Batch'},status:{phase:'Idle',running:false,queue_head:0,config:{}}};
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 };
 try{return {result:await deliveriesList('batch'),calls}}finally{window.fetch=original}
};
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__delivery_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__delivery_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/ui/domain/settings/ToolSwitchRows.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
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
  await until('!!window.fixture && document.querySelectorAll(".tool-delivery").length===6','delivery settings mount');
  for(const width of [320,390,844,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<900});
    await sleep(150);
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'no horizontal overflow at '+width);
    assert.ok(await js('Array.from(document.querySelectorAll(".tool-delivery")).every(el=>{const r=el.getBoundingClientRect();return r.width>=100&&r.right<=innerWidth})'),'controls fit at '+width);
    await writeFile('/tmp/wish-tool-delivery-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  for (const mode of ['command','off','tool']) {
    const point=await js(`(()=>{const r=document.querySelector('.tool-delivery[aria-label^="Web Fetch"] input[value="${mode}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await until(mode==='off'?'fixture.tools.value.web_fetch===false':`fixture.tools.value.web_fetch && fixture.tools.value.web_fetch_delivery==="${mode}"`,'segment '+mode);
  }
  await js(`document.querySelector('.tool-delivery[aria-label^="Web Fetch"] input[value="tool"]').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
  await until('fixture.tools.value.web_fetch_delivery==="command"','keyboard segment navigation');
  const hintPoint=await js(`(()=>{const r=document.querySelector('.tool-delivery[aria-label^="Web Fetch"] input[value="command"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...hintPoint});
  await until('!!document.querySelector(".control-tooltip")','icon hover explanation');
  await js('fixture.tools.value.shell=false');
  await until(`document.querySelector('.tool-delivery[aria-label^="Web Fetch"] input[value="command"]').disabled`,'shell mode unavailable without shell');
  const queued=await js('window.readQueue()');
  assert.deepEqual(queued.result.items.map(item=>item.id),['12','10','11','95'],'queue order survives batched reads; internal instructions remain hidden');
  assert.deepEqual(queued.calls,[[10,3],[95,1],[98,1]],'read adjacent entries together without reading history gaps');
  assert.equal(queued.result.has_more,true);
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,widths:[320,390,844,1100],checks:['delivery selectors','no horizontal overflow','shared settings styling','batched queue order and sparse ranges']}));
} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
