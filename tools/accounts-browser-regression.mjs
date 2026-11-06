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
import ExtensionToolsSettings from '/src/features/settings/ExtensionToolsSettings.vue';
import ToolSettings from '/src/features/settings/ToolSettings.vue';
import AccountSettings from '/src/features/settings/AccountSettings.vue';
import {extensionTool} from '/src/extensions/registry.ts';
import ProcessDetailBody from '/src/features/sessions/entries/ProcessDetailBody.vue';
import MediaGenerationSettings from '/src/features/settings/MediaGenerationSettings.vue';
import ImageGenerationSettings from '/src/features/settings/ImageGenerationSettings.vue';
import SearchSettings from '/src/features/settings/SearchSettings.vue';
import FetchSettings from '/src/features/settings/FetchSettings.vue';
import {configDraftKey} from '/src/features/settings/useConfigDraft.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {createBackLayers,setBackLayers} from '/src/ui/backLayers.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/domain/settings/settings.css';
registerBrowserPlatform({ namespace: 'wish-webui', version: 1 });setBackLayers(createBackLayers(window));
const draft=ref({accounts:{shared:{name:'Shared account',preset:'deepseek',api_key:'<redacted>',credentials:{refresh_token:'<redacted>'},credentials_env:{},proxy_enabled:true}},providers:{model:{credential_id:'shared'}},search:{providers:{}},fetch:{order:[],providers:{}}});
const catalog=ref({presets:[{id:'deepseek',provider:'DeepSeek',protocols:['deepseek_chat'],variants:{deepseek_chat:{protocol:'deepseek_chat',base_url:'https://api.deepseek.com'}},required_credentials:[],optional_credentials:[]}]});
const searchCatalog=ref([{id:'tavily',name:'Tavily',brand:'Tavily',key:'required'},{id:'jina',name:'Jina',brand:'Jina',key:'required'},{id:'tavily_keyless',name:'Tavily Free',key:'none'}]);
const imageCatalog=ref(${JSON.stringify(JSON.parse(await readFile(new URL('./fixtures/image-presets.json', import.meta.url),'utf8')))});
const mediaCatalog=ref(${JSON.stringify(JSON.parse(await readFile(new URL('./fixtures/media-presets.json', import.meta.url),'utf8')))});
const mode=ref('accounts'),extensionSection=ref('');const saveConfig=async()=>true;
const fetchCatalog=ref([{id:'deepseek_fetch',name:'DeepSeek',key:'required',base_url:'https://api.deepseek.com'},{id:'zai_reader',name:'Z.AI',key:'required'},{id:'jina_reader',name:'Jina Reader',key:'optional'},{id:'codex_fetch',name:'ChatGPT / Codex',key:'required'}]);
function mediaPreview(){const binding=extensionTool('audio_generate').result({tool:'audio_generate',session:'fixture',arguments:{},metadata:null,output:{job_id:'job',kind:'music',provider:'mock',model:'fixture',status:'running',artifacts:[]}});return h(binding.component,binding.props);}
function novelaiPreview(){return h(ProcessDetailBody,{session:'fixture',step:{kind:'block',block:{type:'tool_call',name:'novelai_generate',arguments:{prompt:'A referenced character in a snowy forest',service:'novelai-main',source_image:'b'.repeat(64),references:[{image:'c'.repeat(64),kind:'character',strength:0.8,fidelity:1},{image:'d'.repeat(64),kind:'style',strength:0.4,fidelity:0.7}],parameters:{width:1024,negative_prompt:'blur, low quality',sampler:'k_euler_ancestral',noise_schedule:'karras',cfg_rescale:0,dynamic_thresholding:false,character_prompts:[{prompt:'girl, red coat',negative_prompt:'blue coat',centers:[{x:0.25,y:0.5}]},{prompt:'girl, blue coat',centers:[{x:0.75,y:0.5}]}]}}}},relatedResult:{kind:'entry',entry:{payload:{tool_name:'novelai_generate',result:{status:'success',output:{model:'nai-diffusion-4-5-full',images:[{id:'a'.repeat(64),mime_type:'image/png',path:'/fixture/result.png'}]}}}}}});}
function bflPreview(fill){const name=fill?'bfl_fill':'bfl_generate';return h(ProcessDetailBody,{session:'fixture',step:{kind:'block',block:{type:'tool_call',name,arguments:{prompt:fill?'Replace the masked jacket with a red coat':'Reference-guided product photograph',...(fill?{}:{service:'bfl-main'}),...(fill?{source_image:'b'.repeat(64),mask:'c'.repeat(64)}:{reference_images:['b'.repeat(64),'https://example.com/reference.png']}),parameters:fill?{steps:30,guidance:40}:{seed:42,output_format:'png'}}}},relatedResult:{kind:'entry',entry:{payload:{tool_name:name,result:{status:'success',output:{model:fill?'flux-pro-1.0-fill':'flux-2-pro',images:[{id:'a'.repeat(64),mime_type:'image/png',path:'/fixture/flux.png'}]}}}}}});}
function minimaxPreview(mixed=false){return h(ProcessDetailBody,{session:'fixture',step:{kind:'block',block:{type:'tool_call',name:'minimax_speech',arguments:{action:'run',text:'Welcome to Wish. This text will be read aloud.',voice:{...(mixed?{}:{id:'English_Graceful_Lady'}),speed:1.2,volume:1.5,pitch:-2,emotion:'calm'},parameters:{...(mixed?{timbre_weights:[{voice_id:'English_Graceful_Lady',weight:100},{voice_id:'English_Insightful_Speaker',weight:100}]}:{}),subtitle_enable:true,subtitle_type:'word',language_boost:'English',latex_read:false,audio_setting:{format:'wav',sample_rate:24000,channel:2},pronunciation_dict:{tone:['Wish/wish']},voice_modify:{pitch:-30,timbre:0}}}}},relatedResult:{kind:'entry',entry:{payload:{tool_name:'minimax_speech',result:{status:'success',output:{job_id:'minimax-job',kind:'speech',provider:'minimax',model:'speech-2.8-hd',status:'downloading',artifacts:[]}}}}}});}
function minimaxListPreview(){const jobs=Array.from({length:25},(_,i)=>({job_id:i.toString(16).padStart(64,'0'),kind:'speech',provider:'minimax',model:'speech-2.8-hd',status:'succeeded',artifacts:[{id:'a'.repeat(64),mime_type:'audio/wav',path:'/fixture/speech.wav',byte_count:3244}]}));return h(ProcessDetailBody,{session:'fixture',step:{kind:'entry',entry:{payload:{tool_name:'minimax_speech',result:{status:'success',output:{jobs}}}}}});}
function runwayVideoPreview(prores=false,archive=false){return h(ProcessDetailBody,{session:'fixture',step:{kind:'block',block:{type:'tool_call',name:'runway_video',arguments:{action:'edit',prompt:'A forest background',video:{blob:'b'.repeat(64)},output_format:archive?'png_sequence':prores?'prores':undefined,prores_profile:prores?'422 HQ':undefined,seed:0,target_aspect_ratio:'21:9',keyframes:[{image:{blob:'c'.repeat(64)},seconds:2.5,range:{start_seconds:1,end_seconds:4}},{image:{url:'https://example.com/end.png'},at:0.75,range:{start_seconds:4,end_seconds:8}}]}}},relatedResult:{kind:'entry',entry:{payload:{tool_name:'runway_video',result:{status:'success',output:{job_id:'runway-fixture',kind:'video',provider:'runway_aleph_video',model:'aleph2',status:'succeeded',artifacts:[{id:'a'.repeat(64),mime_type:archive?'application/zip':prores?'video/quicktime':'video/mp4',path:archive?'/fixture/frames.zip':prores?'/fixture/generated.mov':'/fixture/generated.mp4',byte_count:100}]}}}}}});}
function xaiVideoPreview(){return h(ProcessDetailBody,{session:'fixture',step:{kind:'block',block:{type:'tool_call',name:'xai_video',arguments:{action:'generate',prompt:'A cinematic scene, <AUDIO_0> speaks',generate_audio:false,image:{blob:'b'.repeat(64)},last_frame:{blob:'c'.repeat(64)},reference_images:[{url:'https://example.com/reference.png'}],keyframes:[{image:{blob:'d'.repeat(64)},timestamp_s:2}],reference_voices:['eve'],duration:6,resolution:'720p'}}},relatedResult:{kind:'entry',entry:{payload:{tool_name:'xai_video',result:{status:'success',output:{job_id:'xai-video-job',kind:'video',provider:'xai',model:'grok-imagine-video-1.5',status:'succeeded',artifacts:[{id:'a'.repeat(64),mime_type:'video/mp4',path:'/fixture/generated.mp4',byte_count:100}]}}}}}});}
function xaiSpeechPreview(){return h(ProcessDetailBody,{session:'fixture',step:{kind:'block',block:{type:'tool_call',name:'xai_speech',arguments:{action:'run',text:'Welcome to Wish.',voice_id:'eve',language:'en',speed:1.1,output_format:{codec:'wav',sample_rate:24000},with_timestamps:true,text_normalization:false,replace:{Wish:'wish'}}}},relatedResult:{kind:'entry',entry:{payload:{tool_name:'xai_speech',result:{status:'success',output:{job_id:'xai-job',kind:'speech',provider:'xai',model:'grok-voice',status:'succeeded',artifacts:[{id:'a'.repeat(64),mime_type:'audio/wav',path:'/fixture/speech.wav',byte_count:3244}],timestamps:{id:'e'.repeat(64),mime_type:'application/json',path:'/fixture/timestamps.json',byte_count:100}}}}}}});}
function xaiTranscriptionPreview(){return h(ProcessDetailBody,{session:'fixture',step:{kind:'block',block:{type:'tool_call',name:'xai_transcribe',arguments:{audio:'b'.repeat(64),language:'en',diarize:true,format:true,multichannel:true,filler_words:false,vad_threshold:0,keyterms:['Wish','小云雀']}}},relatedResult:{kind:'entry',entry:{payload:{tool_name:'xai_transcribe',result:{status:'success',output:{text:'Hello speakers. Welcome to Wish.',model:'grok-voice-transcribe-2.0',language:'en',word_timestamps:true,transcript:{id:'e'.repeat(64),mime_type:'application/json',path:'/fixture/transcript.json',byte_count:100}}}}}}});}
createApp({setup(){provide(configDraftKey,{draft,busy:ref(false),serverDirty:ref(false),providerOptions:ref([]),catalog,searchCatalog,fetchCatalog,imageCatalog,mediaCatalog,saveConfig,load:async()=>{}});return()=>h(TooltipProvider,{},()=>h('main',{style:'padding:16px;width:min(800px,100vw);margin:auto'},[h('h1','Settings fixture'),mode.value==='extensions'?h(ExtensionToolsSettings,{initialSection:extensionSection.value,onSelected:value=>extensionSection.value=value,save:saveConfig,searchAvailable:true,statuses:{},statusesKnown:true}):mode.value==='builtin-tools'?h(ToolSettings,{config:draft.value,shells:null,busy:false,searchAvailable:true}):mode.value==='runway-zip'?runwayVideoPreview(false,true):mode.value==='runway-prores'?runwayVideoPreview(true):mode.value==='runway-video'?runwayVideoPreview():mode.value==='xai-video'?xaiVideoPreview():mode.value==='xai-speech'?xaiSpeechPreview():mode.value==='xai-transcription'?xaiTranscriptionPreview():mode.value==='minimax-jobs'?minimaxListPreview():mode.value==='minimax-mixed'?minimaxPreview(true):mode.value==='minimax'?minimaxPreview():mode.value.startsWith('bfl:')?bflPreview(mode.value==='bfl:fill'):mode.value==='novelai'?novelaiPreview():mode.value==='player'?mediaPreview():mode.value.startsWith('media:')?h(MediaGenerationSettings,{section:mode.value.slice(6)}):mode.value==='images'?h(ImageGenerationSettings):mode.value==='accounts'?h(AccountSettings):mode.value==='search'?h(SearchSettings,{config:draft.value,models:[],presets:[{id:'chatgpt',name:'ChatGPT',brand:'OpenAI'}],statuses:{chatgpt:{available:true}},statusesKnown:true,save:saveConfig,busy:false,dirty:false}):h(FetchSettings,{save:saveConfig})]));}}).use(createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]})).mount('#app');
window.fixture={draft,mode,extensionSection};
</script></body></html>`;
const wav=Buffer.alloc(3244);wav.write('RIFF');wav.writeUInt32LE(3236,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(3200,40);
let rangeRequests=0;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression',
  resolveId(id) { if(id==='virtual:pwa-register') return '\0fixture-pwa-register'; },
  load(id) { if(id==='\0fixture-pwa-register') return 'export const registerSW = () => async () => {};'; },
  configureServer(server) {
    server.middlewares.use('/api', (req,res,next)=>{
      if(/^\/sessions\/fixture\/blobs\/[a-f0-9]{64}(?:\/image\?width=(?:384|768|1536))?$/.test(req.url ?? '')) {res.setHeader('Content-Type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=','base64'));return;}
      if(req.url==='/sessions/fixture/media/audio/job/status' || req.url==='/sessions/fixture/media/audio/minimax-job/status') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({job_id:req.url.includes('minimax-job')?'minimax-job':'job',kind:req.url.includes('minimax-job')?'speech':'music',provider:req.url.includes('minimax-job')?'minimax':'mock',model:'fixture',status:'succeeded',timestamps:req.url.includes('minimax-job')?{id:'e'.repeat(64),mime_type:'application/json',path:'/fixture/subtitles.json',byte_count:100}:null,artifacts:[{id:'a'.repeat(64),path:'/session/generated.wav',mime_type:'audio/wav',byte_count:wav.length}]}));return;}
      if(req.url?.endsWith('/playback')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:'/fixture-audio',expires_at:9999999999}));return;}
      if(req.url==='/fixture-audio') {res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes');if(req.headers.range){rangeRequests++;res.statusCode=206;res.setHeader('Content-Range',`bytes 0-${wav.length-1}/${wav.length}`);}res.setHeader('Content-Length',wav.length);res.end(wav);return;}
      next();
    });
    server.middlewares.use('/__accounts_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__accounts_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/settings/AccountSettings.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'highlight.js/lib/common', 'highlight.js/lib/languages/dockerfile', 'highlight.js/lib/languages/powershell', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
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
    await until('!document.querySelector(".runway-video-invocation")','clear Runway preview');
    await js('fixture.mode.value="runway-video"');
    await until('!!document.querySelector(".runway-video-result video")','Runway result mounted');
    assert.equal(await js('document.querySelector(".runway-video-result video").preload'),'metadata');
    assert.ok(await js('document.querySelector(".runway-video-result video").controls'));
    assert.equal(await js('document.querySelectorAll(".runway-video-invocation img").length'),0);
    await js('document.querySelector(".runway-video-invocation .input-toggle").click()');
    await until('document.querySelectorAll(".runway-video-invocation .inputs img").length===1','Runway local frame preview');
    assert.equal(await js('document.querySelectorAll(".runway-video-invocation .inputs > section").length'),3);
    assert.ok(await js('document.querySelector(".runway-video-invocation .inputs").textContent.includes("2.5 s")'));
    assert.ok(await js('document.querySelector(".runway-video-invocation .inputs").textContent.includes("75%")'));
    assert.ok(await js('document.querySelector(".runway-video-invocation .inputs").textContent.includes("1–4 s")'));
    assert.ok(await js('document.querySelector(".runway-video-invocation dl").textContent.includes("21:9")'));
    assert.ok(await js('[...document.querySelectorAll(".runway-video-invocation dd")].some(e=>e.textContent.trim()==="0")'));

    assert.ok(await js('document.querySelector(".runway-video-invocation .inputs").textContent.includes("https://example.com/end.png")'));
    assert.ok(await js('!Array.from(document.querySelectorAll(".runway-video-invocation img")).some(e=>e.src.startsWith("https://example.com"))'));
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'Runway details fit viewport');
    await writeFile('/tmp/wish-runway-video-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js('document.querySelector(".runway-video-invocation .input-toggle").click()');
    await until('document.querySelectorAll(".runway-video-invocation img").length===0','Runway frame released');
    await js('fixture.mode.value="runway-prores"');
    await until('[...document.querySelectorAll(".runway-video-result .artifact-download")].some(e=>e.download.endsWith(".mov"))','ProRes download link');
    assert.equal(await js('document.querySelectorAll(".runway-video-result video,.runway-video-result audio").length'),0,'QuickTime is not incorrectly mounted as MP4 or audio');
    assert.ok(await js('document.querySelector(".runway-video-invocation dl").textContent.includes("422 HQ")'));
    assert.ok(await js('document.querySelector(".runway-video-result").textContent.includes("QuickTime / ProRes")'));
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'ProRes details fit viewport');
    await js('fixture.mode.value="runway-zip"');
    await until('[...document.querySelectorAll(".runway-video-result .artifact-download")].some(e=>e.download.endsWith(".zip"))','PNG sequence download link');
    assert.equal(await js('document.querySelectorAll(".runway-video-result video,.runway-video-result audio").length'),0);
    assert.ok(await js('document.querySelector(".runway-video-result").textContent.includes("PNG")'));
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'ZIP details fit viewport');


  }
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
    for (const [section,preset] of [['video_generation','seedance_video'],['video_generation','xai_video_lite'],['audio_generation','siliconflow_speech'],['audio_generation','minimax_speech'],['audio_transcription','groq_asr']]) {
      await js('fixture.mode.value='+JSON.stringify('media:'+section));
      await until('!!document.querySelector(".media-settings .provider-add")','media settings');
      await js('document.querySelector(".media-settings .provider-add").click()');
      await until('!!document.querySelector("[data-choice-key='+preset+']")','media preset');
      await js('document.querySelector("[data-choice-key='+preset+']").click()');
      if(width>=900) await js('document.querySelector(".picker-dialog-actions .primary").click()');
      await until('!!document.querySelector(".media-editor")','media editor');
      assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'media editor fits viewport');
      if(preset==='seedance_video') {
        assert.ok(await js('(()=>{const text=document.querySelector(".media-editor").textContent;return text.includes("多模态参考")||text.includes("Multimodal references")})()'),'video capabilities are visible');
        assert.equal(await js('Array.from(document.querySelectorAll(".media-editor select option")).some(o=>o.textContent==="2K")'),false,'Seedance does not show MiniMax resolutions');
        assert.ok(await js('Array.from(document.querySelectorAll(".media-editor select option")).some(o=>o.textContent==="720p")'),'Seedance 720p available');
      }
      if(preset==='xai_video_lite') {
        assert.ok(await js('Object.values(fixture.draft.value.video_generation.providers).some(p=>p.preset==="xai_video_lite"&&p.model==="grok-imagine-video-1.5-lite")'),'Lite model retained');
        assert.ok(await js('Array.from(document.querySelectorAll(".media-editor select option")).some(o=>o.textContent==="1080p")'),'Lite exposes upscaled1080p option');
        assert.ok(await js('!document.querySelector(".media-editor").textContent.includes("首尾帧")'),'Lite does not promise last-frame guidance');
        assert.ok(await js('!document.querySelector(".media-editor").textContent.includes("多模态参考")'),'Lite does not promise references');
      }
      if(preset==='siliconflow_speech') assert.ok(await js('Object.values(fixture.draft.value.audio_generation.providers).some(p=>p.parameters.voice==="FunAudioLLM/CosyVoice2-0.5B:alex")'),'speech voice default applied');
      if(preset==='minimax_speech') {
        await until('!!document.querySelector(".media-editor input[name=speed]")','MiniMax controls');
        await js('(()=>{const input=document.querySelector(".media-editor input[name=speed]");input.value="1.4";input.dispatchEvent(new Event("input",{bubbles:true}));})()');
        assert.ok(await js('Object.values(fixture.draft.value.audio_generation.providers).some(p=>p.preset==="minimax_speech"&&p.parameters.speed===1.4)'),'speech speed edits saved to draft');
        assert.equal(await js('Array.from(document.querySelectorAll(".media-editor select option")).some(o=>o.value==="whisper")'),false,'2.8 excludes whisper');
        await js('(()=>{const label=Array.from(document.querySelectorAll(".media-editor label")).find(el=>/^(模型 ID|Model ID)$/.test(el.querySelector(".set-label")?.textContent.trim()||""));const input=label.querySelector("input");input.value="speech-2.6-hd";input.dispatchEvent(new Event("input",{bubbles:true}));})()');
        await until('Array.from(document.querySelectorAll(".media-editor select option")).some(o=>o.value==="whisper")','2.6 supports whisper');
        await js('(()=>{const input=document.querySelector(".media-editor input[name=speed]");input.value="";input.dispatchEvent(new Event("input",{bubbles:true}));})()');
        assert.ok(await js('Object.values(fixture.draft.value.audio_generation.providers).some(p=>p.preset==="minimax_speech"&&p.parameters.speed===null)'),'clearing speed restores service default');
      }
      await sleep(200);
      await writeFile('/tmp/wish-'+section+'-'+width+'.png', Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await js('document.querySelector(".media-editor .account-picker .btn").click()');
      await until('!!document.querySelector(".account-form")','media account editor');
      assert.ok(await js('Object.values(fixture.draft.value.accounts).some(a=>a.preset==='+JSON.stringify(section==='video_generation'?'volcengine_cn':preset==='minimax_speech'?'minimax':section==='audio_generation'?'siliconflow_cn':'groq')+')'),'media account platform retained');
      await js('history.back()');await until('!document.querySelector(".account-form")','close media account');
      assert.ok(await js('Object.values(fixture.draft.value['+JSON.stringify(section)+'].providers).every(p=>p.credential_id)'),'media service account linked');
      assert.equal(await js('Array.from(document.querySelectorAll(".account-picker button")).some(b=>/解除关联|Unlink account/.test(b.getAttribute("aria-label")||""))'),false,'required media account cannot be unlinked');
      if(width<900) {
        const otherId=preset+'-priority-other';
        const beforeCount=await js('Object.keys(fixture.draft.value['+JSON.stringify(section)+'].providers).length');
        await js('(()=>{const c=fixture.draft.value['+JSON.stringify(section)+'];const id=c.order.at(-1);const other='+JSON.stringify(otherId)+';c.providers[other]=structuredClone(JSON.parse(JSON.stringify(c.providers[id])));c.order.push(other);})()');
        await js('history.back()');
        await until('!document.querySelector(".media-editor")','close editor before changing priority');
        await js('Array.from(document.querySelectorAll(".media-settings .settings-item-grip")).at(-2).focus()');
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
        await until('fixture.draft.value['+JSON.stringify(section)+'].order.at(-2)==='+JSON.stringify(otherId),'mobile move changes priority');
        await js('Array.from(document.querySelectorAll(".media-settings .settings-item-row")).at(-1).click()');
        await until('!!document.querySelector(".media-editor")','reopen reordered media service');
        await js('Array.from(document.querySelectorAll("button")).find(b=>/^(删除服务|Delete service)$/.test(b.textContent.trim())).click()');
        await until('!document.querySelector(".media-editor")','mobile delete closes editor');
        assert.equal(await js('Object.keys(fixture.draft.value['+JSON.stringify(section)+'].providers).length'),beforeCount,'mobile service deleted');
      } else {
        await js('history.back()');await until('!document.querySelector(".media-editor")','close media editor');
      }
    }
    await js('fixture.draft.value.video_generation={order:[],providers:{}};fixture.mode.value="media:video_generation"');
    await until('!!document.querySelector(".media-settings .provider-add")','visual media settings');
    await js('document.querySelector(".media-settings .provider-add").click()');
    await until('!!document.querySelector("[data-choice-key=xiaoyunque_video]")','Xiaoyunque preset');
    await js('document.querySelector("[data-choice-key=xiaoyunque_video]").click()');
    if(width>=900) await js('document.querySelector(".picker-dialog-actions .primary").click()');
    await until('!!document.querySelector(".media-editor")','Xiaoyunque editor');
    assert.ok(await js('Array.from(document.querySelectorAll(".media-editor select option")).some(o=>o.value==="～30s")'),'agent duration hints');
    assert.equal(await js('!!document.querySelector(".media-editor input[type=number]")'),false,'agent does not offer exact duration');
    await js('document.querySelector(".media-editor .account-picker .btn").click()');
    await until('!!document.querySelector(".account-form")','visual account editor');
    assert.ok(await js('(()=>{const text=document.querySelector(".account-form").textContent;return text.includes("Access Key ID (AK)")&&text.includes("Secret Access Key (SK)")&&(text.includes("临时安全令牌")||text.includes("Session token"))&&!text.includes("API Key / Access token")})()'),'visual AK/SK fields without bearer token');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'visual credentials fit viewport');
    await sleep(450);
    await writeFile('/tmp/wish-visual-account-'+width+'.png', Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js('history.back()');await until('!document.querySelector(".account-form")','close visual account');
    await js('history.back()');await until('!document.querySelector(".media-editor")','close visual editor');
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
    await until('document.querySelectorAll(".fetch-list .ordered-settings-list .settings-item").length===2','sortable readers');
    await sleep(400);
    const selector=width<900?'.settings-item-grip':'.settings-item-heading';
    const points=await js(`Array.from(document.querySelectorAll('.fetch-list .ordered-settings-list ${selector}')).map(el=>{const r=el.getBoundingClientRect();return {x:widthPlaceholder<900?r.x+r.width/2:r.x+90,y:r.y+r.height/2};})`.replace('widthPlaceholder',String(width)));
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
  for(const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    await js('fixture.mode.value="novelai"');
    await until('!!document.querySelector(".novelai-invocation") && !!document.querySelector(".novelai-result img")','extension invocation and result mounting');
    assert.equal(await js('document.querySelector(".novelai-invocation .prompt").textContent'),'A referenced character in a snowy forest');
    assert.equal(await js('document.querySelectorAll(".novelai-invocation li").length'),2);
    assert.equal(await js('document.querySelectorAll(".novelai-invocation .character").length'),2);
    assert.ok(await js('document.querySelector(".novelai-invocation .character .negative").textContent.includes("blue coat")'),'individual negative caption shown');
    assert.ok(await js('document.querySelector(".novelai-invocation .character .position").textContent.includes("0.25, 0.5")'),'character coordinates readable');
    assert.ok(await js('document.querySelector(".novelai-invocation .parameters").textContent.includes("k_euler_ancestral")'),'native sampler visible');
    assert.ok(await js('[...document.querySelectorAll(".novelai-invocation .parameters > div")].some(row=>/去锐化|Decrisper/.test(row.querySelector("dt").textContent)&&/关闭|Off/.test(row.querySelector("dd").textContent))'),'explicit false shown as off');
    assert.ok(await js('[...document.querySelectorAll(".novelai-invocation .parameters > div")].some(row=>/引导重缩放|Guidance rescale/.test(row.querySelector("dt").textContent)&&row.querySelector("dd").textContent.trim()==="0")'),'zero rescale remains visible');
    assert.equal(await js('document.querySelector(".novelai-invocation .previews")'),null,'input images are not mounted before expansion');
    await js('document.querySelector(".novelai-invocation .inputs button").click()');
    await until('document.querySelectorAll(".novelai-invocation .previews img").length===3','source and reference previews');
    await until('[...document.querySelectorAll(".novelai-invocation .previews img"),document.querySelector(".novelai-result img")].every(img=>img.complete && img.naturalWidth>0)','extension image bytes decoded');
    assert.equal(await js('document.querySelector(".novelai-invocation .inputs button").getAttribute("aria-expanded")'),'true');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'extension details fit viewport');
    await writeFile('/tmp/wish-novelai-details-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js('document.querySelector(".novelai-invocation .inputs button").click()');
    await until('!document.querySelector(".novelai-invocation .previews")','closing removes input images');
  }
  for(const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    for(const mode of ['bfl:generate','bfl:fill']) {
      await js('fixture.mode.value='+JSON.stringify(mode));
      await until('!!document.querySelector(".bfl-invocation") && !!document.querySelector(".bfl-result img")','BFL extension details');
      assert.equal(await js('document.querySelectorAll(".bfl-invocation li").length'),2);
      assert.ok(await js('document.querySelector(".bfl-invocation .prompt").textContent.length>0'));
      assert.equal(await js('document.querySelector(".bfl-invocation .previews")'),null);
      await js('document.querySelector(".bfl-invocation .inputs button").click()');
      const count=mode==='bfl:fill'?2:1;
      await until('document.querySelectorAll(".bfl-invocation .previews img").length==='+count,'BFL local image previews only');
      assert.ok(await js('[...document.querySelectorAll(".bfl-invocation img")].every(img=>!img.src.includes("example.com"))'),'remote references are never fetched by browser');
      assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'BFL details fit viewport');
      if(mode==='bfl:fill') {
        assert.ok(await js('document.querySelector(".bfl-invocation header").textContent.includes("优先级") || document.querySelector(".bfl-invocation header").textContent.includes("priority")'),'omitted service shows priority routing');
        assert.ok(await js('document.querySelector(".bfl-invocation .inputs").textContent.includes("白色") || document.querySelector(".bfl-invocation .inputs").textContent.includes("white")'),'Fill mask semantics visible');
        await writeFile('/tmp/wish-bfl-details-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      }
      await js('document.querySelector(".bfl-invocation .inputs button").click()');
      await until('!document.querySelector(".bfl-invocation .previews")','BFL input cleanup');
    }
  }
  for(const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    await js('fixture.mode.value="accounts"');
    await until('!document.querySelector(".minimax-result")','clear speech preview');
    await js('fixture.mode.value="minimax"');
    await until('!!document.querySelector(".minimax-invocation") && !!document.querySelector(".minimax-result .btn")','MiniMax details mount');
    assert.equal(await js('document.querySelector(".minimax-invocation .speech-text").textContent'),'Welcome to Wish. This text will be read aloud.');
    assert.equal(await js('document.querySelectorAll(".minimax-invocation .voice-controls > div").length'),5);
    await js('document.querySelector(".minimax-result .btn").click()');
    await until('!!document.querySelector(".minimax-result audio") && document.querySelector(".minimax-result audio").readyState>=1','MiniMax recovered audio playback');
    assert.equal(await js('document.querySelector(".minimax-result audio").preload'),'metadata');
    assert.ok(await js('document.querySelector(".minimax-result .timing-download").href.endsWith("/blobs/"+"e".repeat(64))'));

    assert.ok(await js('document.querySelector(".minimax-invocation .native-parameters").textContent.includes("24000")'));
    await js('document.querySelector(".minimax-invocation .pronunciation summary").click()');
    assert.equal(await js('document.querySelector(".minimax-invocation .pronunciation li").textContent'),'Wish/wish');

    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'speech details fit viewport');
    await writeFile('/tmp/wish-minimax-details-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  for (const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
    await js('fixture.mode.value="minimax-mixed"');
    await until('document.querySelectorAll(".mixed-voices tbody tr").length===2','mixed voice rows');
    assert.deepEqual(await js('Array.from(document.querySelectorAll(".mixed-voices tbody td:last-child"),e=>e.textContent)'),['100','100']);
    assert.ok(await js('!document.querySelector(".native-parameters").textContent.includes("[object Object]")'));
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'mixed voices fit viewport');
    await writeFile('/tmp/wish-minimax-mixed-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await js('fixture.mode.value="minimax-jobs"');
  await until('document.querySelectorAll(".minimax-result details").length===20','bounded initial speech job list');
  assert.equal(await js('document.querySelectorAll(".minimax-result audio").length'),0,'job list does not eagerly load audio');
  await js('document.querySelector(".minimax-result summary").click()');
  await until('document.querySelectorAll(".minimax-result audio").length===1','opening one job mounts one player');
  await js('document.querySelector(".minimax-result summary").click()');
  await until('document.querySelectorAll(".minimax-result audio").length===0','closing job releases player');
  await js('document.querySelector(".minimax-result .media-jobs > button").click()');
  await until('document.querySelectorAll(".minimax-result details").length===25','more speech jobs');
  for(const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    await js('fixture.mode.value="xai-transcription"');
    await until('!!document.querySelector(".xai-transcription-invocation") && !!document.querySelector(".xai-transcription-result")','xAI transcription details');
    assert.equal(await js('document.querySelector(".xai-transcription-result .transcript-text").textContent'),'Hello speakers. Welcome to Wish.');
    assert.equal(await js('document.querySelectorAll(".xai-transcription-invocation .terms li").length'),2);
    assert.ok(await js('document.querySelector(".xai-transcription-invocation").textContent.includes("关闭") || document.querySelector(".xai-transcription-invocation").textContent.includes("Off")'),'false options are displayed');
    assert.ok(await js('document.querySelector(".xai-transcription-result a").href.endsWith("/blobs/"+"e".repeat(64))'),'full transcript uses session-owned blob link');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'transcription details fit viewport');
    await writeFile('/tmp/wish-xai-transcription-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  assert.deepEqual(exceptions,[],'no runtime exceptions');
  for (const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
    await js('fixture.mode.value="accounts"');
    await until('!document.querySelector(".xai-speech-result")','clear xAI speech');
    await js('fixture.mode.value="xai-speech"');
    await until('!!document.querySelector(".xai-speech-result audio") && document.querySelector(".xai-speech-result audio").readyState>=1','xAI speech playback');
    assert.ok(await js('document.querySelector(".xai-speech-result .timing-download").href.endsWith("/blobs/"+"e".repeat(64))'));
    assert.ok(await js('document.querySelector(".xai-speech-invocation").textContent.includes("24000")'));
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'speech details fit viewport');
    await writeFile('/tmp/wish-xai-speech-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  for (const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
    await js('fixture.mode.value="accounts"');
    await until('!document.querySelector(".xai-video-invocation")','clear xAI video');
    await js('fixture.mode.value="xai-video"');
    await until('!!document.querySelector(".xai-video-result video")','xAI video result');
    assert.equal(await js('document.querySelector(".xai-video-result video").preload'),'metadata');
    assert.ok(await js('document.querySelector(".xai-video-invocation dl").textContent.includes("关闭") || document.querySelector(".xai-video-invocation dl").textContent.includes("Off")'),'false audio control is visible');

    assert.ok(await js('document.querySelector(".xai-video-result video").controls'));
    assert.equal(await js('document.querySelectorAll(".xai-video-invocation img").length'),0,'images deferred');
    await js('document.querySelector(".xai-video-invocation .input-toggle").click()');
    await until('document.querySelectorAll(".xai-video-invocation .inputs img").length===3','local guidance previews');
    assert.equal(await js('document.querySelectorAll(".xai-video-invocation .inputs > section").length'),4);
    assert.ok(await js('document.querySelector(".xai-video-invocation .inputs").textContent.includes("https://example.com/reference.png")'));
    assert.ok(await js('!Array.from(document.querySelectorAll(".xai-video-invocation img")).some(e=>e.src.startsWith("https://example.com"))'),'remote references not fetched');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'video details fit viewport');
    await writeFile('/tmp/wish-xai-video-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js('document.querySelector(".xai-video-invocation .input-toggle").click()');
    await until('document.querySelectorAll(".xai-video-invocation img").length===0','close releases references');
  }
  for(const width of [390,1100]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    await js('fixture.draft.value.defaults={tools:{shell:true}};fixture.mode.value="extensions"');
    const keys=['image_generate','video_generate','audio_generate','audio_transcribe','web_fetch','web_search'];
    const sections=['image_generation','video_generation','audio_generation','audio_transcription','fetch','search'];
    for(let i=0;i<keys.length;i++) {
      if(width<700) {
        await js('fixture.extensionSection.value=""');
        await until('document.querySelectorAll(".extension-categories button").length===6','six extension categories');
        await js(`document.querySelectorAll('.extension-categories button')[${i}].click()`);
      } else {
        await until('!!document.querySelector(".extension-category-select")','extension category picker');
        await js('document.querySelector(".extension-category-select").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}))');
        await until(`!!document.querySelector('.control-select-option[data-value="${sections[i]}"]')`,'extension category option');
        await js(`document.querySelector('.control-select-option[data-value="${sections[i]}"]').dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))`);
      }
      await until(`!!document.querySelector('.extension-defaults [data-tool="${keys[i]}"]')`,'selected extension');
      assert.equal(await js('document.querySelectorAll(".extension-defaults .capability-row").length'),1);
      await js(`document.querySelector('.extension-defaults input[value="tool"]').click()`);
      assert.equal(await js(`fixture.draft.value.defaults.tools.${keys[i]}`),true);
      assert.equal(await js(`fixture.draft.value.defaults.tools.${keys[i]}_delivery`),'tool');
      assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'extension tools fit viewport');
    }
    await writeFile('/tmp/wish-extension-tools-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js('fixture.mode.value="builtin-tools"');
    await until('!document.querySelector(".extension-tools-settings")','built-in tools');
    assert.ok(await js('![...document.querySelectorAll(".set-label > span")].some(e=>/^(Image Generate|Video Generate|Audio Generate|Audio Transcribe|Web Fetch|Web Search)$/.test(e.textContent))'));
    assert.equal(await js('fixture.draft.value.defaults.tools.image_generate'),true,'moving pages preserves extension defaults');
  }
  console.log(JSON.stringify({ok:true,widths:[390,1100],checks:['xAI native transcription controls and full transcript blob link','MiniMax native speech details and recovered audio playback','BFL generate/Fill details, model-specific labels and local-only previews','NovelAI invocation/result and deferred reference previews at mobile/desktop widths','video/audio/ASR settings and account linking','native audio range playback','image service and nested image account','search and reader account catalog','keyless services excluded','search account creation and editing','masked credentials and erased replacements','nested account creation','back dismisses top layer','no horizontal overflow','mouse and touch drag reorder','search overflow at 320/390/844px','two-stage account deletion and cancellation']}));
} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
