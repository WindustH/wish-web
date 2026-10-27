// Opt-in activity recorder: privacy, request metadata and persistence.
// Run: node tools/activity-log-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><body><button id="action">Action</button><input id="input"><img id="image"><script type="module">
import {createRouter,createMemoryHistory} from 'vue-router';
import {installActivityRecorder} from '/src/ui/domain/diagnostics/activityRecorder.ts';
import * as log from '/src/ui/domain/diagnostics/activityStore.ts';
import {installScrollStallLog,stalls,clearStalls} from '/src/ui/domain/diagnostics/scrollStalls.ts';
installScrollStallLog();
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{}}]});await router.push('/sessions');
const fetchBase=window.fetch;
window.fetch=(input,init)=>String(input).includes('/diagnostic-test')?Promise.resolve(new Response('ok')):fetchBase(input,init);
window.originalFetch=window.fetch;
installActivityRecorder(router);
window.fixture={...log,router,stalls,clearStalls};
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {name:'pwa-stub',resolveId(id){if(id==='virtual:pwa-register')return '\0pwa-stub';},load(id){if(id==='\0pwa-stub')return 'export const registerSW=()=>()=>{}';}}, {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__activity_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__activity_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/ui/domain/diagnostics/activityRecorder.ts'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__activity_regression`});
  await until('!!window.fixture','recorder ready');
  assert.equal(await js('fixture.activityEnabled.value'),false,'disabled by default');
  await js('document.querySelector("#action").click()');
  assert.equal(await js('fixture.activityCount.value'),0,'disabled recorder does not observe');
  assert.equal(await js('window.fetch===window.originalFetch'),true,'disabled fetch is untouched');
  await js('fixture.setActivityEnabled(true)');
  await js(`document.querySelector('#input').value='PRIVATE_MESSAGE';document.querySelector('#input').dispatchEvent(new InputEvent('input',{bubbles:true,data:'PRIVATE_MESSAGE',inputType:'insertText'}));document.querySelector('#action').click();`);
  await js(`fetch('/diagnostic-test?token=PRIVATE_TOKEN',{method:'POST',body:'PRIVATE_BODY',headers:{authorization:'PRIVATE_AUTH'}})`);
  await js(`fixture.router.push('/sessions/all?secret=PRIVATE_ROUTE')`);
  await js(`document.querySelector('#image').src='/missing-image?token=PRIVATE_IMAGE'`);
  await until('JSON.parse(fixture.exportActivity()).records.some(r=>r.kind==="resource.error")','resource failures captured');
  const recording=await js('fixture.exportActivity()');
  assert.ok(!recording.includes('PRIVATE_'),'contents, query strings and credentials are excluded');
  const records=JSON.parse(recording).records;
  for(const kind of ['click','input','request.start','request.headers','navigation.start','navigation.finish','resource.error']) assert.ok(records.some(r=>r.kind===kind),kind);
  assert.ok(records.every(r=>r.build && r.at && r.tab),'records identify build and timing');
  await js('fixture.setActivityEnabled(false)');
  // The pane is still rendered, but hit testing bypasses it. Streaming moves
  // down while the user's upward wheel never reaches the scrolling container.
  await js(`fixture.setActivityEnabled(true);fixture.clearStalls();
    const pane=document.createElement('div');pane.className='content-pane';
    pane.style.cssText='position:fixed;left:0;top:250px;width:300px;height:200px;pointer-events:none';
    pane.innerHTML='<div class="chatlog" style="height:200px;overflow:auto"><div style="height:2000px">scroll fixture</div></div>';
    document.body.append(pane);pane.firstChild.scrollTop=500;
    window.addEventListener('wheel',()=>setTimeout(()=>pane.firstChild.scrollTop+=40,30),{once:true});`);
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:100,y:300,deltaY:-100,deltaX:0});
  await sleep(400);
  const evidence=await js(`JSON.parse(fixture.exportActivity()).records.filter(r=>r.kind==='wheel'||r.kind==='scroll.stall'||r.kind==='wheel.finished')`);
  assert.ok(evidence.some(r=>r.kind==='wheel'&&r.detail.deltaY===-100&&r.detail.targetInsideRegion===false));
  assert.ok(evidence.some(r=>r.kind==='scroll.stall'&&r.detail.region.ancestors.some(a=>a.pointerEvents==='none')),'auto-follow must not hide blocked upward wheel');
  assert.ok(evidence.some(r=>r.kind==='wheel.finished'&&r.detail.region.top===540));
  await js(`document.querySelector('.content-pane').remove();fixture.setActivityEnabled(false)`);
  const count=await js('fixture.activityCount.value');
  await js('document.querySelector("#action").click();fetch("/diagnostic-test")');
  assert.equal(await js('fixture.activityCount.value'),count,'disabling detaches listeners');
  assert.equal(await js('window.fetch===window.originalFetch'),true,'disabling restores fetch');
  await send('Page.reload');await until('!!window.fixture','reload');
  assert.equal(await js('fixture.activityEnabled.value'),false);
  assert.equal(await js('fixture.activityCount.value'),count,'records survive reload');
  await js('fixture.setActivityEnabled(true);for(let i=0;i<2100;i++)fixture.recordActivity("bounded",{i});fixture.flushActivity()');
  assert.equal(await js('fixture.activityCount.value'),2000,'bounded log');
  await js('fixture.setActivityEnabled(false);fixture.clearActivity()');
  assert.equal(await js('fixture.activityCount.value'),0,'clear saved logs');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['off by default','input privacy','request metadata','navigation','image failure','disable cleanup','reload persistence','bounded storage','clear','blocked wheel during auto-follow']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
