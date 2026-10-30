// Select portals must not dismiss the session settings that own them.
// Run: node tools/select-dialog-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref,provide} from 'vue';
import {TooltipProvider} from 'reka-ui';
import ExtensionToolsSettings from '/src/features/settings/ExtensionToolsSettings.vue';
import {configDraftKey} from '/src/features/settings/useConfigDraft.ts';
import SessionPanelModal from '/src/domain/chat/SessionPanelModal.vue';
import ToolSwitchRows from '/src/domain/settings/ToolSwitchRows.vue';
import {extensionSections} from '/src/extensions/settings.ts';
import ExtensionCategoryPicker from '/src/domain/settings/ExtensionCategoryPicker.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/domain/settings/settings.css';
const selection=ref('image_generation'),open=ref(true),closes=ref(0),tools=ref({shell:true});
const mode=ref('session'),initialSection=ref('video_generation'),busy=ref(false),draft=ref({defaults:{tools:{shell:true,video_generate:false}},credentials:{}});
window.fixture={selection,open,closes,mode,initialSection,busy,draft};
createApp({setup(){
 provide(configDraftKey,{draft,busy,serverDirty:ref(false),providerOptions:ref([]),searchCatalog:ref([]),imageCatalog:ref([]),mediaCatalog:ref([]),fetchCatalog:ref([])});
 return()=>h(TooltipProvider,{},()=>[
 h('button',{id:'anchor',style:'position:absolute;top:20px;right:20px','data-session-panel':'settings','aria-pressed':'true',onClick:()=>open.value=true},'Settings'),
 h('button',{id:'outside',style:'position:absolute;bottom:20px;left:20px'},'Outside'),
 h(SessionPanelModal,{open:open.value,title:'Session settings',onClose:()=>{closes.value++;open.value=false;}},()=>mode.value==='global'?h(ExtensionToolsSettings,{initialSection:initialSection.value,save:async()=>true,searchAvailable:true,statuses:{},statusesKnown:true,onSelected:value=>initialSection.value=value}):h(ToolSwitchRows,{extensionRows:extensionSections.value.map(item=>({key:item.toolKey,name:item.label,hint:item.description})),modelValue:tools.value,compact:true,include:[extensionSections.value.find(item=>item.id===selection.value).toolKey],searchAvailable:true},{label:()=>h(ExtensionCategoryPicker,{categories:extensionSections.value,modelValue:selection.value,'onUpdate:modelValue':value=>selection.value=value})}))
])}}).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'select-dialog-regression', configureServer(server) { server.middlewares.use('/__select_dialog', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__select_dialog', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/domain/settings/ExtensionCategoryPicker.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-select-dialog-'));
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
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:844,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__select_dialog`});
  await until('!!document.querySelector(".modal-card .control-select")','settings mounted');
  const click=async selector=>{
    const point=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  await js('window.originalTrigger=document.querySelector(".control-select")');
  for (const value of ['video_generation','audio_generation','audio_transcription','fetch','search','image_generation']) {
    await click('.control-select');
    await until('!!document.querySelector(".control-select-option")','options open');
    await sleep(300);
    assert.equal(await js('fixture.closes.value'),0,'opening the select keeps settings open');
    await click(`[data-value="${value}"]`);
    await until(`fixture.selection.value==="${value}"`,'selection applied');
    await sleep(300);
    assert.equal(await js('fixture.closes.value'),0,'selecting an option keeps settings open');
    assert.ok(await js('originalTrigger===document.querySelector(".control-select")'),'picker trigger stays mounted');
    await until('document.activeElement===originalTrigger','focus returns to the picker');
  }
  const key=async (key,code)=>{
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});
  };
  await key('Enter','Enter');
  await until('!!document.querySelector(".control-select-option")','keyboard opens picker');
  await until('document.activeElement?.dataset.value==="image_generation"','selected item focused');
  await key('ArrowDown','ArrowDown');
  await until('document.activeElement?.dataset.value==="video_generation"','keyboard moves selection');
  await key('Enter','Enter');
  await until('fixture.selection.value==="video_generation" && document.activeElement===originalTrigger','keyboard selection restores focus');
  assert.equal(await js('fixture.closes.value'),0,'keyboard selection keeps settings open');
  await click('.control-select');
  await until('!!document.querySelector(".control-select-option")','reopen for Escape');
  await key('Escape','Escape');
  await until('!document.querySelector(".control-select-option")','Escape closes the picker');
  assert.equal(await js('fixture.closes.value'),0,'Escape in picker does not close settings');
  await click('#outside');
  await until('fixture.closes.value===1 && !fixture.open.value','outside click still dismisses settings');
  await js('fixture.mode.value="global";fixture.open.value=true');
  await until('!!document.querySelector(".extension-defaults .capability-picker .control-select")','global settings uses inline picker');
  assert.equal(await js('document.querySelectorAll(".extension-tools-settings .extension-category-select").length'),1,'one category picker without standalone duplicate');
  assert.ok(await js(`(()=>{const row=document.querySelector('.extension-defaults .capability-row'),select=row.querySelector('.control-select'),delivery=row.querySelector('.tool-delivery');const a=select.getBoundingClientRect(),b=delivery.getBoundingClientRect();return row.classList.contains('compact')&&Math.abs((a.top+a.height/2)-(b.top+b.height/2))<2&&a.right<=b.left&&getComputedStyle(select).backgroundColor==='rgba(0, 0, 0, 0)';})()`),'picker and delivery controls share the compact row');
  await click('.extension-defaults .control-select');
  await until('!!document.querySelector(".control-select-option")','global categories open');
  await click('[data-value="audio_generation"]');
  await until('fixture.initialSection.value==="audio_generation" && !!document.querySelector("[data-tool=audio_generate]")','global category changes inline');
  await sleep(300);
  await click('.extension-defaults .segment:has(input[value="tool"])');
  await until('fixture.draft.value.defaults.tools.audio_generate===true && fixture.draft.value.defaults.tools.audio_generate_delivery==="tool"','delivery edits selected tool defaults');
  assert.equal(await js('fixture.draft.value.defaults.tools.video_generate'),false,'other tool defaults unchanged');
  assert.equal(await js('fixture.closes.value'),1,'global category switch keeps panel open');
  await js('fixture.busy.value=true');
  assert.equal(await js('document.querySelector(".extension-defaults .control-select").matches(":disabled")'),true,'saving disables inline category picker');
  await js('fixture.busy.value=false;fixture.initialSection.value=undefined');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until('document.querySelectorAll(".extension-pages button").length===6','mobile retains category navigation');
  assert.equal(await js('document.querySelectorAll(".extension-defaults").length'),0,'mobile overview has no inline controls');
  await js('document.querySelector(".extension-pages button").click()');
  await until('!!document.querySelector(".extension-defaults .capability-row:not(.compact)")','mobile detail retains labeled tool controls');
  assert.equal(await js('document.querySelectorAll(".extension-defaults .capability-picker").length'),0,'mobile detail has no redundant category dropdown');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['all extension categories','stable picker and restored focus','keyboard selection','Escape closes only picker','outside click closes settings','global inline picker and delivery','mobile category navigation']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
