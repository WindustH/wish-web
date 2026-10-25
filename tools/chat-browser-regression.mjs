// Isolated real-browser transcript regression. Uses synthetic history, never a live backend.
// Run: node tools/chat-browser-regression.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import { createApp, h, ref, provide } from 'vue';
import { TooltipProvider } from 'reka-ui';
import ChatLog from '/src/features/sessions/ChatLog.vue';
import { chat } from '/src/core/state/chatSlice.ts';
import { registerBrowserPlatform } from '/src/platform/browser/index.ts';
import { pageActivityKey } from '/src/ui/composables/usePageActivity.ts';
import { applyTokens } from '/src/ui/applyTokens.ts';
import '/src/styles/tokens.css'; import '/src/styles/base.css'; import '/src/styles/layout.css';
import '/src/styles/components.css'; import '/src/styles/features.css';
window.fixtureErrors=[]; window.addEventListener('error',event=>window.fixtureErrors.push(event.message));
registerBrowserPlatform(); applyTokens();
chat.sessionId.value='fixture'; chat.loadingInitial.value=false;
chat.entries.value=Array.from({length:2000},(_,i)=>({seq:i+1,id:i+1,created_at:0,kind:i%2?'assistant_message':'user_message',payload:{content:[{type:'text',text:'Message '+(i+1)+' — '+ '长会话滚动与手势验证。'.repeat(30)}]}}));
chat.entries.value=chat.entries.value.map((entry,i)=>i>=500&&i<1500?{...entry,kind:'assistant_message',payload:{content:[{type:'tool_call',id:'call-'+i,name:'shell_edit',arguments:{command:'echo '+i}}]}}:entry);
const active=ref(true), mobile=ref(true), session=ref('fixture');
createApp({setup(){provide(pageActivityKey,active);return()=>h(TooltipProvider, {}, {default:()=>h('main',{style:{height:'100vh',display:active.value?'flex':'none',flexDirection:'column'}},[h(ChatLog,{sessionId:session.value,mobile:mobile.value})])});}}).mount('#app');
window.fixture={chat,active,mobile,session};
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__chat_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__chat_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/sessions/ChatLog.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-chat-browser-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__chat_regression`});
  await until('!!window.fixture && !!document.querySelector(".chat-virtual-row")','transcript mounted');
  await sleep(700);
  const geometry=()=>js(`(()=>{const e=document.querySelector('.chatlog');return{top:e.scrollTop,height:e.scrollHeight,viewport:e.clientHeight,rows:document.querySelectorAll('.chat-virtual-row').length}})()`);
  let before=await geometry();assert.ok(before.height>before.viewport);assert.ok(before.rows<60,'transcript must stay virtualized');
  // Actual touch input travels through browser pointer handling and CSS touch-action.
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:300}]});
  for(let x=90;x<=145;x+=5){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:300}]});await sleep(17);}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);
  const transform=await js(`getComputedStyle(document.querySelector('.chatlog-content')).transform`);
  assert.match(transform, /44/, 'right swipe opens the rail');
  await js('fixture.active.value=false');await sleep(100);await js('fixture.active.value=true');await sleep(300);
  await until('document.querySelectorAll(".chat-virtual-row").length>0','reactivation restores rows without new messages');
  const beforeWheel=await geometry();
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:300,deltaX:0,deltaY:-500});await sleep(350);
  const after=await geometry();assert.ok(after.top<beforeWheel.top-100,'wheel escapes the tail after reactivation');
  await js(`fixture.chat.stream.value={...fixture.chat.stream.value,active:true,text:'New live output'};`);
  await sleep(200);
  const afterStream=await geometry();assert.ok(afterStream.top<afterStream.height-afterStream.viewport-100,'new output respects browsing history');
  // Resize repeatedly across the mobile/desktop boundary; no empty range or runaway DOM.
  for(const width of [700,1000,600,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    await js(`fixture.mobile.value=${width<700}`);await sleep(150);
    const g=await geometry();assert.ok(g.rows>0&&g.rows<80,'resizing retains a bounded visible range');
  }
  assert.deepEqual(exceptions,[],'no browser runtime exceptions');
  assert.deepEqual(await js('window.fixtureErrors'),[],'no layout observer errors');
  console.log(JSON.stringify({ok:true,entries:2000,toolCalls:1000,before,beforeWheel,after,transform}));
} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
