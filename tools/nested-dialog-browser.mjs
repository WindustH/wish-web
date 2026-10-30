// Dismissing a service picker must not dismiss its containing settings window.
// Run: node tools/nested-dialog-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref,provide,KeepAlive,computed} from 'vue';
import {createRouter,createMemoryHistory,RouterView} from 'vue-router';
import {TooltipProvider} from 'reka-ui';
import {pageActivityKey} from '/src/ui/composables/usePageActivity.ts';
import SettingsView from '/src/features/settings/SettingsView.vue';
import {closeOverlayKey} from '/src/ui/composables/overlay.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/ui/domain/settings/settings.css';
registerBrowserPlatform({namespace:'wish-nested-regression',version:1});
const config={providers:{},accounts:{},defaults:{tools:{shell:true}},audio_transcription:{order:[],providers:{}},search:{order:[],providers:{}}};
const replies={'/config':{config,revision:'1'},'/provider-presets':{presets:[]},'/media-presets':{presets:[{id:'fixture-asr',name:'Fixture Transcription',brand:'OpenAI',kind:'transcription',model:'fixture-model',protocol:'openai_transcription',account_presets:[],defaults:{}}]},'/proxy-environment':{variables:[]},'/search/providers':{providers:[],available:true}};
const nativeFetch=window.fetch;
window.fetch=(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input),location.href);return url.pathname.startsWith('/api/')?Promise.resolve(new Response(JSON.stringify(replies[url.pathname.slice(4)]??{presets:[],providers:[]}),{headers:{'Content-Type':'application/json'}})):nativeFetch(input,init);};
const closes=ref(0);
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/settings',component:SettingsView},{path:'/home',component:{render:()=>h('p','Home')}}]});
window.fixture={closes,router};
await router.push('/settings?section=extensions&tool=audio_transcription');await router.isReady();
createApp({setup(){provide(pageActivityKey,computed(()=>router.currentRoute.value.path==='/settings'));provide(closeOverlayKey,async()=>{closes.value++;await router.push('/home');});return()=>h(TooltipProvider,{},()=>h(RouterView,{},({Component})=>h(KeepAlive,{},()=>h(Component))));}}).use(router).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'nested-dialog-regression',
  resolveId(id) { if(id==='virtual:pwa-register') return '\0fixture-pwa-register'; },
  load(id) { if(id==='\0fixture-pwa-register') return 'export const registerSW = () => async () => {};'; }, configureServer(server) { server.middlewares.use('/__nested_dialog', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__nested_dialog', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/settings/SettingsView.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-nested-dialog-'));
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
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await js(expression))return;await sleep(100);}throw Error(label+' '+JSON.stringify({exceptions,dom:await js('document.body.innerHTML.slice(-2000)'),fixture:await js('!!window.fixture')}));};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:844,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__nested_dialog`});
  await until('!!document.querySelector(".media-settings .provider-add")','settings loaded');
  const click=async (selector,corner=false)=>{
    const point=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:r.x+${corner?5:"r.width/2"},y:r.y+${corner?5:"r.height/2"}};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  const key=async key=>{
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});
  };
  for(const method of ['cancel','escape','outside']) {
    await click('.media-settings .provider-add');
    await until('!!document.querySelector(".picker-dialog input")','add service picker opens');
    await sleep(150); // Reka installs its outside-pointer listener after mount.
    if(method==='cancel') await click('.picker-dialog .btn.ghost');
    else if(method==='escape') await key('Escape');
    else await click('.modal-overlay',true);
    await until('!document.querySelector(".picker-dialog")','picker closes via '+method);
    await sleep(400);
    assert.equal(await js('fixture.closes.value'),0,method+' must not close settings');
    assert.ok(await js('!!document.querySelector(".native-settings[data-state=open]")'),'settings remains visible');
  }
  await click('.settings-overlay',true);
  await until('fixture.closes.value===1 && fixture.router.currentRoute.value.path==="/home"','settings still dismisses after all children close');
  await js('fixture.router.push("/settings?section=extensions&tool=audio_transcription")');
  await until('!!document.querySelector(".media-settings .provider-add")','settings reopened');
  await click('.media-settings .provider-add');
  await until('!!document.querySelector(".picker-dialog input")','picker reopens');
  await sleep(150);
  await click('[data-choice-key="fixture-asr"]');
  await click('.picker-dialog .btn.primary');
  await until('!!document.querySelector(".settings-editor .media-editor") && !document.querySelector(".picker-dialog")','adding opens service editor');
  assert.equal(await js('fixture.closes.value'),1,'adding keeps settings open');
  await sleep(150);
  await click('.media-editor .account-picker .btn.sm');
  await until('!!document.querySelector(".account-editor")','nested account editor opens');
  await sleep(150);
  await js('window.remainingSettings=document.querySelector(".native-settings");window.remainingService=document.querySelector(".settings-editor:not(.account-editor)")');
  // There are now three dialog levels: settings -> service -> account.
  const topOverlay=await js('Array.from(document.querySelectorAll(".modal-overlay")).sort((a,b)=>Number(a.style.zIndex)-Number(b.style.zIndex)).at(-1).style.zIndex');
  await click(`.modal-overlay[style*="z-index: ${topOverlay}"]`,true);
  await until('!document.querySelector(".account-editor")','account scrim closes only account');
  await sleep(400);
  assert.ok(await js('remainingSettings.isConnected && remainingService.isConnected'),'both ancestors survive nested scrim');
  assert.equal(await js('fixture.closes.value'),1,'nested account close keeps settings open');
  await click('.modal-overlay',true);
  await until('!document.querySelector(".settings-editor")','service scrim closes service editor');
  await sleep(400);
  assert.equal(await js('fixture.closes.value'),1,'service close keeps settings open');
  assert.ok(await js('!!document.querySelector(".media-settings .settings-item-card, .media-settings .ordered-settings-list")'),'added service remains in the draft');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['cancel','Escape','child scrim','parent closes after child cleanup','add service','three dialog levels','draft retained']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
