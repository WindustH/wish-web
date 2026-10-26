// Mobile settings navigation regression; uses a local draft and never a live backend.
// Run: node tools/settings-navigation-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref,computed,inject} from 'vue';
import {createRouter,createWebHashHistory,RouterView} from 'vue-router';
import {TooltipProvider} from 'reka-ui';
import {useMobileBackNavigation} from '/src/features/shell/useMobileBackNavigation.ts';
import {useSettingsGuard} from '/src/features/settings/useSettingsGuard.ts';
import {settingsReturnKey} from '/src/features/settings/settingsReturn.ts';
import DraftActions from '/src/ui/components/DraftActions.vue';
import Modal from '/src/ui/components/Modal.vue';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {createBackLayers,setBackLayers} from '/src/ui/backLayers.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/features/settings/settings.css';
registerBrowserPlatform();const layers=createBackLayers(window);setBackLayers(layers);
const draft=ref({name:'Original'}),source=ref(JSON.stringify(draft.value)),busy=ref(false),revision=ref('1'),opened=ref(false);let saves=0,failNext=false;
const Nested={setup(){const returns=inject(settingsReturnKey);return()=>h(Modal,{page:true,open:opened.value,title:'Nested',beforeClose:returns.confirm,onClose:()=>opened.value=false},{default:()=>h('input',{class:'input',value:draft.value.name,onInput:e=>draft.value.name=e.target.value})});}};
const Settings={setup(){
 const guard=useSettingsGuard({isMobile:ref(true),busy,serverDirty:computed(()=>JSON.stringify(draft.value)!==source.value),source,revision,accept:v=>draft.value=v.config,load:async()=>{},saveConfig:async()=>{if(failNext){failNext=false;return false;}saves++;source.value=JSON.stringify(draft.value);return true;}});
 window.fixture={draft,guard,opened,get saves(){return saves;},failSave:()=>{failNext=true;},go:url=>router.push(url)};
 return()=>h(TooltipProvider,{},()=>h('main',[h('header',[h('h1','Settings'),h(DraftActions)]),h('button',{id:'open',onClick:()=>opened.value=true},'Edit'),h(Nested),guard.leave.value?h('div',{id:'leave-prompt'},'Confirm'):null]));
}};
const router=createRouter({history:createWebHashHistory(),routes:[{path:'/',redirect:'/sessions'},{path:'/settings',component:Settings},{path:'/chat',component:{render:()=>h('p','Chat')}},{path:'/sessions',component:{render:()=>h('p','Home')}}]});
const tickets=new WeakMap();
router.beforeEach(async(to,from)=>{if(to.fullPath!==from.fullPath)tickets.set(to,await layers.beforeNavigation());});
router.afterEach((to,from,failure)=>{const ticket=tickets.get(to);if(ticket!=null)layers.afterNavigation(!failure,ticket);});
const app=createApp({setup(){
 const navigation=useMobileBackNavigation(router,ref(true),()=>'/sessions');
 window.navigationFixture={...navigation,router};
 return()=>h(TooltipProvider,{},()=>[h(RouterView),navigation.exitRequested.value?h(Modal,{open:true,backLayer:false,title:'Leave Wish?',onClose:()=>navigation.exitRequested.value=false},{default:()=>h('button',{id:'cancel-exit',onClick:()=>navigation.exitRequested.value=false},'Cancel')}):null]);
}}).use(router);
await router.push('/settings?section=accounts');
await router.isReady();app.mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__before_wish', (_, res) => { res.setHeader('content-type', 'text/html'); res.end('<html><body>Before Wish</body></html>'); }); server.middlewares.use('/__accounts_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__accounts_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/settings/AccountSettings.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-accounts-browser-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__before_wish`});
  await until('document.body?.textContent === "Before Wish"','external browser page');
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__accounts_regression`});
  await until('!!window.fixture','settings mounted');
  await js('document.querySelector("#open").click()');
  await until('!!document.querySelector(".modal-page input")','nested editor');
  await js('const input=document.querySelector(".modal-page input");input.value="Changed";input.dispatchEvent(new Event("input",{bubbles:true}))');
  await until('!!document.querySelector(".modal-page .draft-actions")','header actions appear');
  await js('document.querySelector(".modal-page .modal-head > button").click()');
  await until('!fixture.opened.value','back closes nested page');
  assert.equal(await js('fixture.guard.leave.value'),false,'nested return never prompts');
  assert.equal(await js('fixture.draft.value.name'),'Changed','nested return keeps draft');
  await js('fixture.go("/settings?section=search")');
  assert.equal(await js('fixture.guard.leave.value'),false,'category switch keeps draft without prompt');
  await js('void fixture.go("/settings")');
  await until('fixture.guard.leave.value','return to settings home prompts');
  await js('fixture.guard.resolveLeave(false)');
  await until('!fixture.guard.leave.value','continue editing');
  await js('document.querySelector("main header button[aria-label=保存修改]").click()');
  await until('!fixture.guard.dirty.value','explicit save clears dirty state');
  assert.equal(await js('fixture.saves'),1,'one save');
  await js('fixture.draft.value.name="Discard me"');
  await until('!!document.querySelector("main header button[aria-label=丢弃修改]")','discard action');
  await js('document.querySelector("main header button[aria-label=丢弃修改]").click()');
  assert.equal(await js('fixture.draft.value.name'),'Changed','discard restores saved draft');
  await js('fixture.draft.value.name="Save on return";void fixture.go("/settings")');
  await until('fixture.guard.leave.value','home return asks once');
  await js('fixture.guard.saveAndReturn()');
  await until('!fixture.guard.leave.value && !fixture.guard.dirty.value','save and return');
  assert.equal(await js('fixture.saves'),2);
  await js('fixture.draft.value.name="Keep on failure";fixture.failSave();void fixture.go("/chat")');
  await until('fixture.guard.leave.value','leaving settings with changes prompts');
  await js('fixture.guard.saveAndReturn()');
  assert.equal(await js('fixture.guard.leave.value'),true,'failed save keeps prompt open');
  assert.equal(await js('fixture.draft.value.name'),'Keep on failure','failed save retains draft');
  assert.equal(await js('fixture.guard.dirty.value'),true);
  await js('fixture.guard.resolveLeave(false)');

  await js('fixture.draft.value.name="Save on return";void fixture.go("/settings?section=accounts")');
  await until('navigationFixture.router.currentRoute.value.query.section === "accounts"','account category');
  await js('document.querySelector("#open").click()');
  await until('!!document.querySelector(".modal-page input")','account detail before native Back');
  await js('history.back()');
  await until('!fixture.opened.value && !document.querySelector(".modal-page")','native Back closes detail');
  assert.equal(await js('navigationFixture.router.currentRoute.value.query.section'),'accounts');
  await js('history.back()');
  await until('navigationFixture.router.currentRoute.value.fullPath === "/settings"','native Back returns to settings categories');
  await js('history.back()');
  await until('navigationFixture.router.currentRoute.value.path === "/sessions"','native Back returns home');
  await js('history.back()');
  await until('!!document.querySelector("#cancel-exit")','home Back asks before leaving');
  await js('document.querySelector("#cancel-exit").click()');
  await until('!document.querySelector(".modal-overlay")','cancel exit removes overlay');
  assert.notEqual(await js('document.body.style.pointerEvents'),'none');
  await js('history.back()');
  await until('!!document.querySelector("#cancel-exit")','exit protection survives cancellation');
  await js('history.back()');
  await until('!document.querySelector(".modal-overlay")','native Back cancels exit prompt');

  assert.deepEqual(exceptions,[],'no runtime exceptions');
  await js('history.back()');
  await until('navigationFixture.exitRequested.value','confirm exit is available');
  await js('void navigationFixture.confirmExit()');
  let exited = false;
  for (let attempt=0; attempt<100; attempt++) {
    const history = await send('Page.getNavigationHistory');
    if (history.entries[history.currentIndex].url.endsWith('/__before_wish')) { exited = true; break; }
    await sleep(50);
  }
  assert.ok(exited,'confirmed exit skips internal Wish history and returns to the preceding browser page');
  console.log(JSON.stringify({ok:true,checks:['nested return keeps draft','category navigation does not prompt','home return prompts','header save and discard','save and return','failed save preserves draft','native Back traverses detail/category/home','exit confirmation and cancellation release locks']}));
} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
