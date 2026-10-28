// File cards, stacking and session-owned detail windows.
// Run: node tools/file-changes-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref,computed,provide} from 'vue';
import {TooltipProvider} from 'reka-ui';
import FileChangeCards from '/src/features/sessions/entries/FileChangeCards.vue';
import ActivityDialogs from '/src/features/sessions/ActivityDialogs.vue';
import {openActivityKey} from '/src/features/sessions/activityDialogs.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/features.css';
const many=ref(false), count=ref(3), visible=ref(true), request=ref(null);let tick=0;
const chip=computed(()=>({type:'process',key:'files',steps:[{kind:'entry',key:'result',entry:{seq:2,payload:{tool_name:'shell',metadata:{edits:Array.from({length:count.value},(_,i)=>({path:'/project/src/file-'+i+'.ts',changed:true,diff:(many.value ? ['@@ -0,0 +1,2000 @@',...Array.from({length:2000},(_,n)=>'+line-'+n)] : ['@@ -1 +1 @@','-before','+after']).join(String.fromCharCode(10))}))}}}}]}));
window.fixture={count,visible,request,many};
createApp({setup(){provide(openActivityKey,value=>request.value={...value,requestId:++tick});return()=>h(TooltipProvider,{},()=>[
 h('main',{style:'max-width:736px;margin:40px auto;padding:16px'},[h('h3','文件修改 / File changes'),visible.value?h(FileChangeCards,{item:chip.value}):null]),
 h(ActivityDialogs,{chips:[chip.value],request:request.value,session:'fixture',onDismiss:()=>request.value=null})]);}}).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__file_changes', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__file_changes', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/sessions/entries/FileChangeCards.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-file-changes-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__file_changes`});
  await until('!!window.fixture && document.querySelectorAll(".file-change-card").length===3','three file cards');
  for(const width of [390,1200]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width===390});
    for(const theme of ['dark','light']) {
      await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      for(const count of [1,3,4]) {
        await js(`fixture.count.value=${count}`);
        await until(`document.querySelectorAll('.file-change-card').length===${count>3?1:count}`,'card count');
        assert.equal(await js(`!!document.querySelector('.stacked')`),count>3);
        if(theme==='dark' && count>=3) {
          await mkdir('.cache/file-cards', {recursive:true});
          const image=await send('Page.captureScreenshot',{format:'png'});
          await writeFile(`.cache/file-cards/${width}-${count}.png`,Buffer.from(image.data,'base64'));
        }
        assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow');
      }
    }
  }
  await js('document.querySelector(".file-change-card").click()');
  await until('document.querySelectorAll(".file-diff").length===4','stack shows every file');
  assert.equal(await js('!!document.querySelector(".file-changes-dialog .modal-head")'),false,'file detail uses compact heading');
  await js('fixture.visible.value=false');
  assert.equal(await js('document.querySelectorAll(".file-diff").length'),4,'virtual row unmount keeps dialog');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until('!document.querySelector("[role=dialog]")','Escape closes');
  await js('fixture.visible.value=true;fixture.count.value=3');
  await until('document.querySelectorAll(".file-change-card").length===3','restore cards');
  await js('document.querySelectorAll(".file-change-card")[1].click()');
  await until('document.querySelectorAll(".file-diff").length===1','individual file opens alone');
  assert.ok(await js('document.querySelector(".diff-path").textContent.includes("file-1.ts")'));
  assert.equal(await js('getComputedStyle(document.querySelector(".file-diff")).backgroundColor'),'rgba(0, 0, 0, 0)','single file has no extra background');
  assert.equal(await js('getComputedStyle(document.querySelector(".file-diff")).borderTopWidth'),'0px','single file has no nested border');
  await js('fixture.many.value=true');
  await until('!!document.querySelector(".diff-pagination")','large diff is paged');
  assert.ok(await js('document.querySelectorAll(".diff-line").length<=500'),'diff DOM remains bounded');
  await js('document.querySelectorAll(".diff-pagination button")[1].click()');
  await until('document.querySelector(".diff-pagination span").textContent.startsWith("2")','diff next page');
  assert.ok(await js('document.querySelectorAll(".diff-line").length<=500'),'next diff page remains bounded');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['1/3 individual cards','4-file stack','desktop/mobile','dark/light','single-file detail','stable modal host','Escape closes','2000-line diff pagination']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
