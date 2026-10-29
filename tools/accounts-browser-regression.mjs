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
import {createApp,h,ref,provide} from 'vue';
import {TooltipProvider} from 'reka-ui';
import {createRouter,createMemoryHistory} from 'vue-router';
import AccountSettings from '/src/features/settings/AccountSettings.vue';
import ToolMedia from '/src/features/sessions/entries/ToolMedia.vue';
import MediaGenerationSettings from '/src/features/settings/MediaGenerationSettings.vue';
import ImageGenerationSettings from '/src/features/settings/ImageGenerationSettings.vue';
import SearchSettings from '/src/features/settings/SearchSettings.vue';
import FetchSettings from '/src/features/settings/FetchSettings.vue';
import {configDraftKey} from '/src/features/settings/useConfigDraft.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {createBackLayers,setBackLayers} from '/src/ui/backLayers.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/ui/domain/settings/settings.css';
registerBrowserPlatform({ namespace: 'wish-webui', version: 1 });setBackLayers(createBackLayers(window));
const draft=ref({accounts:{shared:{name:'Shared account',preset:'deepseek',api_key:'<redacted>',credentials:{refresh_token:'<redacted>'},credentials_env:{},proxy_enabled:true}},providers:{model:{credential_id:'shared'}},search:{providers:{}},fetch:{order:[],providers:{}}});
const catalog=ref({presets:[{id:'deepseek',provider:'DeepSeek',required_credentials:[],optional_credentials:[]}]});
const searchCatalog=ref([{id:'tavily',name:'Tavily',brand:'Tavily',key:'required'},{id:'jina',name:'Jina',brand:'Jina',key:'required'},{id:'tavily_keyless',name:'Tavily Free',key:'none'}]);
const imageCatalog=ref(${JSON.stringify(JSON.parse(await readFile(new URL('./fixtures/image-presets.json', import.meta.url),'utf8')))});
const mediaCatalog=ref(${JSON.stringify(JSON.parse(await readFile(new URL('./fixtures/media-presets.json', import.meta.url),'utf8')))});
const mode=ref('accounts');const saveConfig=async()=>true;
const fetchCatalog=ref([{id:'deepseek_fetch',name:'DeepSeek',key:'required',base_url:'https://api.deepseek.com'},{id:'zai_reader',name:'Z.AI',key:'required'},{id:'jina_reader',name:'Jina Reader',key:'optional'},{id:'codex_fetch',name:'ChatGPT / Codex',key:'required'}]);
createApp({setup(){provide(configDraftKey,{draft,catalog,searchCatalog,fetchCatalog,imageCatalog,mediaCatalog,saveConfig,load:async()=>{}});return()=>h(TooltipProvider,{},()=>h('main',{style:'padding:16px;width:min(800px,100vw);margin:auto'},[h('h1','Settings fixture'),mode.value==='player'?h(ToolMedia,{session:'fixture',output:{job_id:'job',kind:'music',provider:'mock',model:'fixture',status:'running',artifacts:[]}}):mode.value.startsWith('media:')?h(MediaGenerationSettings,{section:mode.value.slice(6)}):mode.value==='images'?h(ImageGenerationSettings):mode.value==='accounts'?h(AccountSettings):mode.value==='search'?h(SearchSettings,{config:draft.value,models:[],presets:[{id:'chatgpt',name:'ChatGPT',brand:'OpenAI'}],statuses:{chatgpt:{available:true}},statusesKnown:true,save:saveConfig,busy:false,dirty:false}):h(FetchSettings,{save:saveConfig})]));}}).use(createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]})).mount('#app');
window.fixture={draft,mode};
</script></body></html>`;
const wav=Buffer.alloc(3244);wav.write('RIFF');wav.writeUInt32LE(3236,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(3200,40);
let rangeRequests=0;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) {
    server.middlewares.use('/api', (req,res,next)=>{
      if(req.url==='/sessions/fixture/media/audio/job/status') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({job_id:'job',kind:'music',provider:'mock',model:'fixture',status:'succeeded',artifacts:[{id:'a'.repeat(64),path:'/session/generated.wav',mime_type:'audio/wav',byte_count:wav.length}]}));return;}
      if(req.url?.endsWith('/playback')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:'/fixture-audio',expires_at:9999999999}));return;}
      if(req.url==='/fixture-audio') {res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes');if(req.headers.range){rangeRequests++;res.statusCode=206;res.setHeader('Content-Range',`bytes 0-${wav.length-1}/${wav.length}`);}res.setHeader('Content-Length',wav.length);res.end(wav);return;}
      next();
    });
    server.middlewares.use('/__accounts_regression', async (_, res) => {
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__accounts_regression`});
  await until('!!window.fixture && !!document.querySelector(".provider-add")','accounts mount');
  await js('document.querySelector(".provider-add").click()');
  await until('!!document.querySelector("[data-choice-key=tavily]")','search account offered');
  assert.ok(await js('!!document.querySelector("[data-choice-key=jina_reader]")'),'reader account offered');
  assert.equal(await js('!!document.querySelector("[data-choice-key=tavily_keyless]")'),false,'keyless service is not an account');
  await js('document.querySelector("[data-choice-key=tavily]").click()');
  await until('!!document.querySelector(".account-form")','search account editor');
  assert.equal(await js('fixture.draft.value.accounts.tavily.preset'),'tavily','search account retains platform');
  assert.ok(await js('document.querySelector(".account-form .control-select").textContent.includes("Tavily")'),'editor recognizes search platform');
  await js('history.back()');
  await until('!document.querySelector(".account-form")','close search account editor');
  for(const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    await js('fixture.mode.value="accounts"');
    await until('!!document.querySelector(".provider-add")','accounts page');
    assert.ok(await js('!!document.querySelector(".settings-item-mark .provider-icon")'),'account has a brand icon');
    if(width>=900) assert.equal(await js('document.querySelector(".settings-item-actions button[aria-label^=编辑], .settings-item-actions button[aria-label^=Edit]").textContent.trim()'),'','edit action is an icon');
    await sleep(400);
    await writeFile('/tmp/wish-accounts-list-'+width+'.png', Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js('document.querySelector(".settings-item-row, .settings-item-actions button[aria-label^=编辑], .settings-item-actions button[aria-label^=Edit]").click()');
    await until('!!document.querySelector(".account-form")','account editor');
    assert.equal(await js('document.querySelector(".account-form input[type=password]").value'),'', 'stored secrets stay hidden');
    await js('for(const input of document.querySelectorAll(".account-form input[type=password]")){input.value="replacement";input.dispatchEvent(new Event("input",{bubbles:true}));input.value="";input.dispatchEvent(new Event("input",{bubbles:true}));}');
    assert.equal(await js('fixture.draft.value.accounts.shared.api_key'),'<redacted>','erased key replacement retains saved key');
    assert.equal(await js('fixture.draft.value.accounts.shared.credentials.refresh_token'),'<redacted>','erased credential replacement retains saved token');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'account editor fits width');
    await js('history.back()');
    await until('!document.querySelector(".account-form")','back closes account editor');
    await js('fixture.mode.value="images"');
    await until('!!document.querySelector(".image-generation-settings .provider-add")','image generation settings');
    await js('document.querySelector(".image-generation-settings .provider-add").click()');
    await until('!!document.querySelector(".picker-search input")','image search');
    await js('(()=>{const input=document.querySelector(".picker-search input");input.value="NovelAI";input.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await until('!!document.querySelector("[data-choice-key=novelai_images]")','image preset picker');
    await js('document.querySelector("[data-choice-key=novelai_images]").click()');
    if(width>=900) await js('document.querySelector(".picker-dialog-actions .primary").click()');
    await until('!!document.querySelector(".image-editor")','image service editor');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'image editor fits viewport');
    await js('document.querySelector(".image-editor .account-picker .btn").click()');
    await until('!!document.querySelector(".account-form")','new image account editor');
    assert.ok(await js('Object.values(fixture.draft.value.accounts).some(a=>a.preset==="novelai")'),'image account platform retained');
    assert.ok(await js('document.querySelector(".account-form").textContent.includes("Persistent API Token")'),'NovelAI token label');
    await js('history.back()');
    await until('!document.querySelector(".account-form")','close nested image account');
    assert.ok(await js('Object.values(fixture.draft.value.image_generation.providers).every(p=>p.credential_id && p.model==="nai-diffusion-4-5-full")'),'image service links account and model');
    await js('history.back()');
    await until('!document.querySelector(".image-editor")','close image editor');
    for (const [section,preset] of [['video_generation','seedance_video'],['audio_generation','siliconflow_speech'],['audio_transcription','groq_asr']]) {
      await js('fixture.mode.value='+JSON.stringify('media:'+section));
      await until('!!document.querySelector(".media-settings .provider-add")','media settings');
      await js('document.querySelector(".media-settings .provider-add").click()');
      await until('!!document.querySelector("[data-choice-key='+preset+']")','media preset');
      await js('document.querySelector("[data-choice-key='+preset+']").click()');
      if(width>=900) await js('document.querySelector(".picker-dialog-actions .primary").click()');
      await until('!!document.querySelector(".media-editor")','media editor');
      assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'media editor fits viewport');
      if(section==='video_generation') {
        assert.equal(await js('Array.from(document.querySelectorAll(".media-editor select option")).some(o=>o.textContent==="2K")'),false,'Seedance does not show MiniMax resolutions');
        assert.ok(await js('Array.from(document.querySelectorAll(".media-editor select option")).some(o=>o.textContent==="720p")'),'Seedance 720p available');
      }
      if(section==='audio_generation') assert.ok(await js('Object.values(fixture.draft.value.audio_generation.providers).some(p=>p.parameters.voice==="FunAudioLLM/CosyVoice2-0.5B:alex")'),'speech voice default applied');
      await sleep(200);
      await writeFile('/tmp/wish-'+section+'-'+width+'.png', Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await js('document.querySelector(".media-editor .account-picker .btn").click()');
      await until('!!document.querySelector(".account-form")','media account editor');
      assert.ok(await js('Object.values(fixture.draft.value.accounts).some(a=>a.preset==='+JSON.stringify(section==='video_generation'?'volcengine_cn':section==='audio_generation'?'siliconflow_cn':'groq')+')'),'media account platform retained');
      await js('history.back()');await until('!document.querySelector(".account-form")','close media account');
      assert.ok(await js('Object.values(fixture.draft.value['+JSON.stringify(section)+'].providers).every(p=>p.credential_id)'),'media service account linked');
      assert.equal(await js('Array.from(document.querySelectorAll(".account-picker button")).some(b=>/解除关联|Unlink account/.test(b.getAttribute("aria-label")||""))'),false,'required media account cannot be unlinked');
      if(width<900) {
        await js('(()=>{const c=fixture.draft.value['+JSON.stringify(section)+'];const id=c.order.at(-1);c.providers["priority-other"]=structuredClone(JSON.parse(JSON.stringify(c.providers[id])));c.order.push("priority-other");})()');
        await sleep(50);
        await js('Array.from(document.querySelectorAll(".media-order button")).find(b=>/下移|Move down/.test(b.textContent)).click()');
        assert.equal(await js('fixture.draft.value['+JSON.stringify(section)+'].order.at(-2)'), 'priority-other','mobile move changes priority');
        await js('Array.from(document.querySelectorAll("button")).find(b=>/^(删除服务|Delete service)$/.test(b.textContent.trim())).click()');
        await until('!document.querySelector(".media-editor")','mobile delete closes editor');
        assert.equal(await js('Object.keys(fixture.draft.value['+JSON.stringify(section)+'].providers).length'),1,'mobile service deleted');
      } else {
        await js('history.back()');await until('!document.querySelector(".media-editor")','close media editor');
      }
    }
    await js('fixture.mode.value="fetch"');
    await until('!!document.querySelector(".fetch-list .provider-add")','fetch page');
    await js('document.querySelector(".fetch-list .provider-add").click()');
    await until('!!document.querySelector("[data-choice-key=deepseek_fetch]")','branded fetch picker');
    assert.ok(await js('!!document.querySelector("[data-choice-key=deepseek_fetch] .provider-icon")'),'preset has a brand icon');
    await sleep(400);
    await writeFile('/tmp/wish-fetch-picker-'+width+'.png', Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js('document.querySelector("[data-choice-key=deepseek_fetch]").click()');
    if(width>=900) await js('document.querySelector(".picker-dialog-actions .primary").click()');
    await until('!!document.querySelector(".fetch-form")','fetch editor');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'fetch editor fits width');
    await js('document.querySelector(".account-picker .control-select").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}))');
    await until('!!document.querySelector(".control-select-option[data-value=shared]")','real account options');
    assert.equal(await js('!!document.querySelector(".control-select-option[data-value=none]")'),false,'placeholder is not an account option');
    await js('document.querySelector(".control-select-option[data-value=shared]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
    await until('!!document.querySelector(".account-picker button[aria-label=解除关联]")','linked account');
    await js('document.querySelector(".account-picker button[aria-label=解除关联]").click()');
    await until('document.querySelector(".account-picker .control-select").textContent.includes("选择账户")','unlink restores placeholder');
    await js('document.querySelector(".account-picker .btn").click()');
    await until('!!document.querySelector(".account-form")','nested account editor');
    assert.ok(await js('Object.values(fixture.draft.value.fetch.providers).some(p=>!!p.credential_id)'),'new account links service immediately');
    await js('history.back()');
    await until('!document.querySelector(".account-form") && !!document.querySelector(".fetch-form")','back closes only top layer');
    await js('history.back()');
    await until('!document.querySelector(".fetch-form")','back closes fetch editor');
    await js('fixture.draft.value.fetch={order:["first","second"],providers:{first:{preset:"deepseek_fetch",enabled:true,proxy_enabled:true},second:{preset:"codex_fetch",enabled:true,proxy_enabled:true}}}');
    await until('document.querySelectorAll(".fetch-reorder .settings-item").length===2','sortable readers');
    await sleep(400);
    const selector=width<900?'.settings-item-grip':'.settings-item-heading';
    const points=await js(`Array.from(document.querySelectorAll('.fetch-reorder ${selector}')).map(el=>{const r=el.getBoundingClientRect();return {x:widthPlaceholder<900?r.x+r.width/2:r.x+90,y:r.y+r.height/2};})`.replace('widthPlaceholder',String(width)));
    const [from,to]=points;
    if(width<900) await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
    else { await send('Input.dispatchMouseEvent',{type:'mouseMoved',...from}); await send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',clickCount:1}); }
    for(let step=1;step<=12;step++) {
      const point={x:from.x,y:from.y+(to.y-from.y)*step/12};
      await send(width<900?'Input.dispatchTouchEvent':'Input.dispatchMouseEvent',width<900?{type:'touchMove',touchPoints:[point]}:{type:'mouseMoved',...point,buttons:1});
      await sleep(25);
    }
    if(width<900) await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:from.x,y:to.y,button:'left',clickCount:1});
    await until('fixture.draft.value.fetch.order.join(",")==="second,first"','drag updates provider priority');
    assert.equal(await js('!!document.querySelector(".fetch-form")'),false,'drag does not open editor');

  }
  for(const width of [320,390,844]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    await js('fixture.draft.value.search={order:["chatgpt"],providers:{chatgpt:{preset:"chatgpt",enabled:true,proxy_enabled:true,credential_id:"model-openai_codex"}}};fixture.mode.value="search"');
    await until('!!document.querySelector(".search-list")','search page');
    await sleep(200);
    assert.equal(await js('document.querySelector(".search-list .row-preview").textContent.trim()'),'openai_codex','account label excludes internal prefixes');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'search list fits '+width+'px');
    assert.ok(await js('document.querySelector(".search-list").scrollWidth<=document.querySelector(".search-list").clientWidth+1'),'search contents fit their scroll area');
    assert.ok(await js('document.querySelector(".search-list .settings-item-grip").getBoundingClientRect().right<=innerWidth'),'drag grip stays visible');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:844,deviceScaleFactor:1,mobile:false});
  await js('fixture.draft.value.accounts={shared:{name:"Shared",preset:"deepseek"},keep:{name:"Keep",preset:"deepseek"}};fixture.draft.value.providers={model:{credential_id:"shared"},keep:{credential_id:"keep"}};fixture.draft.value.search={order:["search"],providers:{search:{credential_id:"shared"}}};fixture.draft.value.fetch={order:["reader"],providers:{reader:{credential_id:"shared"}}};fixture.draft.value.defaults={provider:"model",model:"model"};fixture.mode.value="accounts"');
  await until('!!document.querySelector(".settings-item-remove")','account delete action');
  await js('document.querySelector(".settings-item-remove").click()');
  await until('!!document.querySelector(".modal-card .btn.danger")','first delete confirmation');
  assert.ok(await js('!!fixture.draft.value.accounts.shared'),'opening confirmation does not delete');
  await js('document.querySelector(".modal-card .btn.danger").click()');
  await until('!!document.querySelector(".account-removal-list")','second delete confirmation');
  assert.equal(await js('document.querySelectorAll(".account-removal-list li").length'),3,'all linked services listed');
  assert.ok(await js('!!fixture.draft.value.accounts.shared'),'first confirmation does not delete');
  await js('document.querySelector(".modal-card .btn.ghost").click()');
  await until('!document.querySelector(".account-removal-list")','cancel cascade');
  assert.ok(await js('!!fixture.draft.value.accounts.shared'),'cancel keeps account');
  await js('document.querySelector(".settings-item-remove").click()');
  await until('!!document.querySelector(".modal-card .btn.danger")','confirm again');
  await js('document.querySelector(".modal-card .btn.danger").click()');
  await until('!!document.querySelector(".account-removal-list")','second confirmation again');
  await js('document.querySelector(".modal-card .btn.danger").click()');
  await until('!fixture.draft.value.accounts.shared','confirmed cascade');
  assert.ok(await js('!!fixture.draft.value.accounts.keep && !!fixture.draft.value.providers.keep'),'unrelated configuration retained');
  assert.equal(await js('fixture.draft.value.defaults.provider'),'','deleted default cleared');
  await js('fixture.mode.value="player"');
  await until('!!document.querySelector(".tool-media .btn")','media progress card');
  await js('document.querySelector(".tool-media .btn").click()');
  await until('!!document.querySelector(".tool-media audio")','native audio player');
  await until('document.querySelector(".tool-media audio").readyState>=1','audio metadata loaded');
  assert.ok(rangeRequests>0,'native player uses byte-range requests');
  assert.equal(await js('document.querySelector(".tool-media audio").preload'),'metadata');
  assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'media result fits viewport');
  assert.deepEqual(exceptions,[],'no runtime exceptions');
  console.log(JSON.stringify({ok:true,widths:[390,1100],checks:['video/audio/ASR settings and account linking','native audio range playback','image service and nested image account','search and reader account catalog','keyless services excluded','search account creation and editing','masked credentials and erased replacements','nested account creation','back dismisses top layer','no horizontal overflow','mouse and touch drag reorder','search overflow at 320/390/844px','two-stage account deletion and cancellation']}));
} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
