// Real settings and result components with isolated catalogs and audio; never calls a live service.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { browserFixture } from './browserFixture.mjs';

const presets = JSON.parse(await readFile(new URL('../../wish-core/src/extensions/deepseek/presets.json', import.meta.url), 'utf8')).media;
const wav = Buffer.alloc(3244);
wav.write('RIFF'); wav.writeUInt32LE(3236, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(3200, 40);
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref,provide} from 'vue';
import {TooltipProvider} from 'reka-ui';
import {createRouter,createMemoryHistory} from 'vue-router';
import MediaGenerationSettings from '/src/features/settings/MediaGenerationSettings.vue';
import {configDraftKey} from '/src/features/settings/useConfigDraft.ts';
import {accountServices} from '/src/domain/settings/accountServices.ts';
import {extensionTool} from '/src/extensions/registry.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {createBackLayers,setBackLayers} from '/src/ui/backLayers.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/domain/settings/settings.css';
registerBrowserPlatform({namespace:'deepseek-audio-fixture',version:1});setBackLayers(createBackLayers(window));
const draft=ref({accounts:{deepseek:{name:'DeepSeek account',preset:'deepseek',api_key:'fixture',credentials:{},credentials_env:{}}},providers:{},search:{order:[],providers:{}},fetch:{order:[],providers:{}}});
const mediaCatalog=ref(${JSON.stringify(presets)}),catalog=ref({presets:[]});
const mode=ref('settings'),section=ref('audio_generation');
const suggestions=accountServices(draft.value,'deepseek',{models:catalog.value,search:[],fetch:[],image:[],media:mediaCatalog.value}).map(c=>c.key);
const output={job_id:'job',kind:'speech',provider:'deepseek_speech',model:'tts',status:'succeeded',artifacts:[{id:'a'.repeat(64),mime_type:'audio/wav',byte_count:3244,path:'/fixture.wav'}]};
function result(){const tool=extensionTool(mode.value==='speech'?'deepseek_speech':'deepseek_transcribe');const binding=tool.result({tool:tool.name,session:'fixture',arguments:{},output:mode.value==='speech'?output:{text:'你好，Wish。',duration_ms:3200,transcript:{id:'b'.repeat(64)}}});return h(binding.component,binding.props);}
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]});
createApp({setup(){provide(configDraftKey,{draft,catalog,mediaCatalog,searchCatalog:ref([]),fetchCatalog:ref([]),imageCatalog:ref([])});window.fixture={draft,mode,section,suggestions};return()=>h(TooltipProvider,{},()=>mode.value==='settings'?h(MediaGenerationSettings,{key:section.value,section:section.value}):result());}}).use(router).mount('#app');
</script></html>`;

await browserFixture(html, async ({ js, send, until }) => {
  assert.deepEqual(await js('fixture.suggestions'), ['audio_generation:deepseek_speech', 'audio_transcription:deepseek_asr']);
  for (const width of [1100, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 900 });
    for (const [section, preset] of [['audio_generation', 'deepseek_speech'], ['audio_transcription', 'deepseek_asr']]) {
      await js(`fixture.mode.value='settings';fixture.section.value=${JSON.stringify(section)}`);
      await until('!!document.querySelector(".provider-add")', 'settings mount');
      await js('document.querySelector(".provider-add").click()');
      await until(`!!document.querySelector('[data-choice-key="${preset}"]')`, 'DeepSeek offered');
      await js(`document.querySelector('[data-choice-key="${preset}"]').click()`);
      if (width >= 900) {
        await until('!!document.querySelector(".picker-dialog .btn.primary:not(:disabled)")', 'picker selection');
        await js('document.querySelector(".picker-dialog .btn.primary").click()');
      }
      await until('!!document.querySelector(".media-editor")', 'service editor');
      assert.equal(await js('Array.from(document.querySelectorAll(".media-editor .set-label")).some(el=>/^(模型 ID|Model ID)$/.test(el.textContent.trim()))'), false, 'no unsupported model selection');
      assert.ok(await js(`Object.values(fixture.draft.value.${section}.providers).every(p=>p.credential_id==='deepseek')`), 'shares the existing DeepSeek account');
      if (preset === 'deepseek_speech') {
        assert.equal(await js('document.querySelector(".media-editor select.input").value'), 'stella');
        await js('(()=>{const el=document.querySelector(".media-editor select.input");el.value="tide";el.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector(".media-editor [role=switch][aria-label*=Markdown]").click();})()');
        assert.ok(await js('Object.values(fixture.draft.value.audio_generation.providers).some(p=>p.parameters.voice==="tide"&&p.parameters.filter_markdown===false)'));
      } else {
        assert.ok(await js('document.querySelector(".media-editor").textContent.includes("8 MiB")'));
        assert.ok(await js('document.querySelector(".media-editor").textContent.includes("120")'));
      }
      assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'), 'editor fits viewport');
      await writeFile(`/tmp/wish-${preset}-${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      await js('fixture.mode.value="transcript"');
      await until('!document.querySelector(".media-editor")', 'editor closes');
    }
    await until('!!document.querySelector(".tool-transcript")', 'transcription renderer');
    assert.equal(await js('document.querySelector(".transcript-text").textContent'), '你好，Wish。');
    assert.ok(await js('document.querySelector(".tool-transcript a").href.includes("/blobs/"+"b".repeat(64))'));
    await js('fixture.mode.value="speech"');
    await until('!!document.querySelector("audio") && document.querySelector("audio").readyState>=1', 'generated WAV plays');
    assert.ok(await js('document.querySelector("audio").duration>0'));
  }
  console.log('DeepSeek audio: desktop/mobile settings, account reuse, voice/Markdown options, WAV playback and full transcript link passed.');
}, { middleware(req, res, next) {
  if (req.url?.endsWith('/playback')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ path: '/fixture.wav', expires_at: 9999999999 }));
  } else if (req.url?.endsWith('/fixture.wav')) {
    res.setHeader('Content-Type', 'audio/wav'); res.setHeader('Content-Length', wav.length); res.end(wav);
  } else next();
} });
