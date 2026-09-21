<script setup lang="ts">
import { ref, computed, inject, provide, onMounted } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
import Icon from '../../ui/components/Icon.vue';
import { useMedia } from '../../ui/composables/useMedia';
import { usePageActivity } from '../../ui/composables/usePageActivity';
import { useDialogFocus } from '../../ui/composables/useDialogFocus';
const isMobile = useMedia('(max-width: 899px)');
const pageActive = usePageActivity();
const focus = useDialogFocus();
function handleOutside(event: CustomEvent) {
  if ((event.detail.originalEvent.target as Element)?.closest?.('.pwa-update')) event.preventDefault();
}
const closeSettings = inject<() => unknown>('closeSettings')!;
const sections = computed(() => [
  {id:'service', icon:'settings', label:tr('服务与会话','Service & sessions')},
  {id:'providers', icon:'bot', label:tr('提供商','Providers')},
  {id:'ui', icon:'settings-2', label:tr('界面','Interface')},
]);
import { get, put } from '../../core/api/client.js';
import { errorText } from '../../core/config-editor';
import { tr, compactionFields } from './fields';
import UiSettings from './UiSettings.vue';
import MobileSessionSettings from './MobileSessionSettings.vue';
import Modal from '../../ui/components/Modal.vue';
import './settings.css';
import { theme } from '../../core/theme/index.js';
import { prefs } from '../../core/state/prefsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { settingsReturnKey, type ReturnChange } from './settingsReturn';
import AddProvider from './AddProvider.vue';
import PresetProvider from './PresetProvider.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { presetLabel } from '../../ui/providerPresentation';
import type { ConfigCatalog, ProviderPreset } from '../../core/provider-presets';
const newProviderId=ref('');
const catalog=ref<ConfigCatalog>({presets:[]}),adding=ref(false);
const findPreset=(id?:string)=>catalog.value.presets.find(p=>p.id===id);

const route=useRoute(),router=useRouter();
const desktopSection=ref('service');
const mobileSection=computed(()=>sections.value.some(item=>item.id===route.query.section)?String(route.query.section):'');
const tab=computed(()=>isMobile.value?mobileSection.value:desktopSection.value);
function selectSection(id:string){if(isMobile.value)router.push({path:'/settings',query:{section:id}});else desktopSection.value=id;}
function backToCategories(){router.replace({path:'/settings'});}
const draft=ref<any>(),revision=ref(''),source=ref(''),busy=ref(false),error=ref(''),notice=ref('');
const advanced=ref<Record<string,string>>({}),advancedPending=ref<Record<string,boolean>>({});
const serverDirty=computed(()=>!!draft.value&&(JSON.stringify(draft.value)!==source.value||Object.values(advancedPending.value).some(Boolean)));
const preferenceValue=()=>({mode:theme.mode.value,locale:i18n.locale.value,sendOnEnter:prefs.sendOnEnter.value,notifyOnFailure:prefs.notifyOnFailure.value,keepAwake:prefs.keepAwake.value});
const preferenceSource=ref(JSON.stringify(preferenceValue()));
const dirty=computed(()=>serverDirty.value||(isMobile.value&&JSON.stringify(preferenceValue())!==preferenceSource.value));
function restorePreferences(){const value=JSON.parse(preferenceSource.value);theme.setMode(value.mode);i18n.setLocale(value.locale);prefs.setSendOnEnter(value.sendOnEnter);prefs.setNotifyOnFailure(value.notifyOnFailure);prefs.setKeepAwake(value.keepAwake);}
async function save(){if(serverDirty.value&&!await saveConfig())return false;preferenceSource.value=JSON.stringify(preferenceValue());return true;}
const protocolOptions=['openai_responses','plaintext_responses','codex_responses','openai_chat','deepseek_chat','qwen_chat','kimi_k2_chat','kimi_k3_chat','zai_chat','minimax_chat','mimo_chat','tokenhub_chat','mistral_chat','anthropic_messages','deepseek_messages','qwen_messages','kimi_messages','zai_messages','minimax_messages','mimo_messages','tokenhub_messages','google_generate_content','google_vertex_generate_content','google_interactions','bedrock_converse','mistral_conversations'];
function accept(value:any){draft.value=value.config;revision.value=value.revision;source.value=JSON.stringify(value.config);advanced.value={};advancedPending.value={};for(const [id,p]of Object.entries(value.config.providers))advanced.value[id]=JSON.stringify(p,null,2);}
async function load(){busy.value=true;error.value='';try{const [configuration,presets]=await Promise.all([get('/config'),get('/provider-presets')]);catalog.value=presets;accept(configuration);}catch(e){error.value=errorText(e);}finally{busy.value=false;}}
async function saveConfig(){for(const id of Object.keys(advancedPending.value)){if(advancedPending.value[id]&&!applyAdvanced(id))return false;}busy.value=true;error.value='';notice.value='';try{accept(await put('/config',{revision:revision.value,config:draft.value}));notice.value=tr('已保存并生效。正在运行的调用继续使用原配置。','Saved and applied. In-flight calls retain their configuration.');return true;}catch(e){error.value=errorText(e);return false;}finally{busy.value=false;}}
function addProvider(preset?:ProviderPreset){
  const base=preset?.id||'custom';let id=base;let suffix=2;while(draft.value.providers[id])id=`${base}-${suffix++}`;
  const first=preset?.protocols[0];
  draft.value.providers[id]=preset&&first?JSON.parse(JSON.stringify(preset.variants[first])):{enabled:true,proxy_enabled:true,protocol:'openai_chat',base_url:'',path:'/v1/chat/completions',auth:'bearer',api_key:null,api_key_env:null,models:{},headers:{},credentials:{},credentials_env:{}};
  newProviderId.value=id;adding.value=false;
}
function changeProtocol(id:string,protocol:string){
  const provider=draft.value.providers[id],preset=findPreset(provider.preset),variant=preset?.variants[protocol];
  if(variant){for(const field of ['base_url','path','auth','model_list','model_list_path','model_list_base_url','token_count','compaction'])provider[field]=(variant as any)[field]??null;}
  provider.protocol=protocol;
}
const providerOptions=computed(()=>Object.entries(draft.value?.providers??{}).map(([id,value])=>{const p=findPreset((value as any).preset);return {value:id,label:(value as any).display_name?`${(value as any).display_name} · ${id}`:p?`${id} · ${presetLabel(p)}`:id,brand:p?.provider};}));
const modelOptions=computed(()=>{const models=draft.value?.providers[draft.value?.defaults.provider]?.models??{};return [...new Set([...Object.keys(models),draft.value?.defaults.model].filter(Boolean))].map(id=>({value:id,label:models[id]?.display_name?`${models[id].display_name} · ${id}`:id}));});
const effortOptions=computed(()=>{const provider=draft.value?.providers[draft.value?.defaults.provider];const model=provider?.models?.[draft.value?.defaults.model];return [...new Set([...Object.keys(model?.reasoning_efforts??findPreset(provider?.preset)?.reasoning_efforts??{}),draft.value?.defaults.reasoning?.effort].filter(Boolean))].map(value=>({value,label:value}));});
function applyAdvanced(id:string){try{const value=JSON.parse(advanced.value[id]!);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(tr('提供商配置必须是 JSON 对象。','Provider configuration must be a JSON object.'));draft.value.providers[id]=value;advancedPending.value[id]=false;error.value='';return true;}catch(e){error.value=errorText(e);return false;}}

const discard=ref(false);
async function discardChanges(){discard.value=false;await load();}
const leave=ref(false),leaveBusy=ref(false),leaveError=ref('');
let answer:((value:boolean)=>void)|undefined;
let pendingChange:ReturnChange|undefined;
const nestedReturns=new Map<symbol,()=>Promise<void>>();
function confirmReturn(change?:ReturnChange):Promise<boolean>{
  if(!(change?.dirty?.()??dirty.value))return Promise.resolve(true);
  if(answer)return Promise.resolve(false);
  pendingChange=change;leaveError.value='';leave.value=true;
  return new Promise(resolve=>{answer=resolve;});
}
function finishReturn(value:boolean){leave.value=false;const resolve=answer;answer=undefined;pendingChange=undefined;resolve?.(value);}
function resolveLeave(value:boolean){
  if(leaveBusy.value)return;
  if(value){if(pendingChange?.discard)pendingChange.discard();else {if(source.value)accept({config:JSON.parse(source.value),revision:revision.value});if(isMobile.value)restorePreferences();}}
  finishReturn(value);
}
async function saveAndReturn(){
  if(leaveBusy.value)return;leaveBusy.value=true;leaveError.value='';
  try{if(await (pendingChange?.save??save)())finishReturn(true);else leaveError.value=error.value||tr('保存未完成，请检查输入后重试。','Could not save. Check the fields and retry.');}
  catch(e){leaveError.value=errorText(e);}finally{leaveBusy.value=false;}
}
provide(settingsReturnKey,{confirm:confirmReturn,save,register:(key,back)=>{if(back)nestedReturns.set(key,back);else nestedReturns.delete(key);}});
async function guardReturn(){
  if(isMobile.value&&nestedReturns.size){await [...nestedReturns.values()].at(-1)!();return false;}
  return confirmReturn();
}
onBeforeRouteLeave(guardReturn);
onBeforeRouteUpdate((to,from)=>isMobile.value&&to.query.section!==from.query.section?guardReturn():true);
onMounted(load);
</script>
<template>
  <DialogRoot :open="pageActive" :modal="!isMobile" @update:open="open => { if (!open && !isMobile) closeSettings(); }">
  <DialogPortal :disabled="isMobile">
    <DialogOverlay v-if="!isMobile" class="settings-overlay"/>
    <DialogContent as-child :aria-describedby="undefined" @open-auto-focus="focus.opened" @close-auto-focus="focus.closed" @interact-outside="handleOutside">
  <div class="page native-settings">
    <aside v-show="!isMobile||!mobileSection" class="settings-sidebar">
      <header class="settings-heading settings-home-heading">
      <button v-if="isMobile" class="btn ghost icon-only settings-back" :aria-label="tr('返回','Back')" @click="closeSettings"><Icon name="arrow-left"/></button>
      <DialogTitle class="settings-title">{{tr('设置','Settings')}}</DialogTitle>
      </header>
      <nav :aria-label="tr('设置分类','Settings categories')">
        <button v-for="item in sections" :key="item.id" class="settings-section" :class="{selected:!isMobile&&tab===item.id}" :aria-current="tab===item.id?'page':undefined" @click="selectSection(item.id)"><Icon :name="item.icon"/><span>{{item.label}}<small v-if="isMobile" class="category-description">{{item.id==='service'?tr('默认模型、提示词与上下文','Model, instructions and context'):item.id==='providers'?tr('连接、认证与模型管理','Connections, credentials and models'):tr('外观、通知与本地偏好','Appearance, notifications and preferences')}}</small></span><Icon v-if="isMobile" name="chevron-right" class="section-chevron"/></button>
      </nav>
    </aside>
    <section v-show="!isMobile||mobileSection" :key="isMobile?mobileSection:'desktop'" class="settings-detail">
    <header class="settings-heading"><button v-if="isMobile" class="btn ghost icon-only" :aria-label="tr('返回设置','Back to settings')" @click="backToCategories"><Icon name="arrow-left"/></button><h2>{{sections.find(item=>item.id===tab)?.label}}</h2><button v-if="!isMobile" class="btn ghost icon-only" :aria-label="tr('关闭设置','Close settings')" @click="closeSettings"><Icon name="x"/></button></header>
    <div class="settings-content" data-scroll-preserve>
    <p v-if="error" class="load-error" role="alert">{{error}}</p><p v-if="notice && tab!=='ui'" role="status">{{notice}}</p>
    <UiSettings v-if="tab==='ui'"/>
    <template v-else-if="draft">
      <MobileSessionSettings v-if="isMobile&&tab==='service'" :config="draft" :providers="providerOptions" :models="modelOptions" :efforts="effortOptions" :save="save" :busy="busy" :error="error"/>
      <fieldset :disabled="busy" v-else-if="tab==='service'" class="settings-form">
        <section class="settings-group"><h2>{{tr('默认会话','Session defaults')}}</h2><p class="settings-default-note">{{tr('保存后仅用于新建会话，不会更改已有会话的配置。','Saved defaults apply only to new sessions. Existing sessions keep their configuration.')}}</p><div class="settings-fields">
        <label>{{tr('提供商','Provider')}}<SelectField v-model="draft.defaults.provider" :options="providerOptions" :placeholder="providerOptions.length?tr('选择提供商','Choose a provider'):tr('请先添加提供商','Add a provider first')" :aria-label="tr('默认提供商','Default provider')" searchable :search-placeholder="tr('搜索提供商','Search providers')"/></label>
        <label>{{tr('模型 ID','Model ID')}}<SelectField v-if="modelOptions.length" v-model="draft.defaults.model" :options="modelOptions" searchable :aria-label="tr('默认模型','Default model')"/><input v-else class="input" v-model="draft.defaults.model"/></label>
        <label>{{tr('默认思考强度','Default reasoning effort')}}<SelectField v-if="effortOptions.length" :model-value="draft.defaults.reasoning?.effort??''" :options="[{value:'',label:tr('上游默认','Upstream default')},...effortOptions]" @update:model-value="draft.defaults.reasoning={...draft.defaults.reasoning,effort:$event||null}"/><input v-else class="input" :value="draft.defaults.reasoning?.effort??''" @input="draft.defaults.reasoning={...draft.defaults.reasoning,effort:($event.target as HTMLInputElement).value||null}"/></label>
        <label>{{tr('工作目录（绝对路径）','Working directory (absolute path)')}}<input class="input" v-model="draft.defaults.cwd"/></label>
        <label>{{tr('固定提示词','Instructions')}}<textarea class="input" rows="6" v-model="draft.defaults.instructions"/></label>
        <template v-if="draft.defaults.compaction"><label v-for="field in compactionFields()" :key="field.key">{{field.label}}<input class="input" type="number" min="1" v-model.number="draft.defaults.compaction[field.key]"/></label></template>
        </div></section><section class="settings-group"><h2>{{tr('启动参数','Startup settings')}}</h2><p class="hint">{{tr('以下参数在配置文件中修改，重启后生效。','Edit these in the configuration file and restart.')}}</p>
        <dl><dt>{{tr('监听地址','Listen')}}</dt><dd>{{draft.listen}}</dd><dt>{{tr('数据目录','Data directory')}}</dt><dd>{{draft.data_dir}}</dd><dt>{{tr('访问令牌环境变量','Bearer token environment variable')}}</dt><dd>{{draft.bearer_token_env||'—'}}</dd></dl></section>
      </fieldset>
      <div v-else class="provider-settings">
        <p v-if="!isMobile" class="hint">{{tr('选择预置服务商后填写密钥，也可以使用服务器环境变量。保存后对新的模型调用生效。','Choose a provider preset and enter credentials or server environment variables. Saved changes apply to new calls.')}}</p>
        <PresetProvider v-for="(provider,id) in draft.providers" :key="id" :id="String(id)" :initially-open="id===newProviderId" :value="provider" :preset="findPreset(provider.preset)" :protocols="protocolOptions" :save="save" :saving="busy" :save-error="error" :disabled="busy" @remove="delete draft.providers[id];delete advancedPending[id]" @protocol="changeProtocol(String(id),$event)">
          <details @toggle="($event.target as HTMLDetailsElement).open&&!advancedPending[id]&&(advanced[id]=JSON.stringify(provider,null,2))"><summary>{{tr('完整配置 JSON','Full configuration JSON')}}</summary><textarea class="input code" rows="16" v-model="advanced[id]" @input="advancedPending[id]=true"/><button v-if="!isMobile" class="btn" @click="applyAdvanced(String(id))">{{tr('应用到表单','Apply to form')}}</button></details>
        </PresetProvider>
        <button class="btn primary icon-only add-provider" :class="{'provider-add-card':isMobile}" :aria-label="tr('添加提供商','Add provider')" :title="tr('添加提供商','Add provider')" :disabled="busy" @click="adding=true"><Icon name="plus"/></button>
      </div>

    </template><button v-else class="btn" :disabled="busy" @click="load">{{tr('重新载入','Reload')}}</button>
    </div>
      <footer v-if="draft&&tab!=='ui'&&!isMobile"><button class="btn" :disabled="busy||!dirty" @click="discard=true">{{tr('放弃修改','Discard changes')}}</button><button class="btn primary icon-only" :aria-label="tr('保存并生效','Save & apply')" :title="tr('保存并生效','Save & apply')" :disabled="busy||!dirty" @click="save"><Icon name="save"/></button></footer>
    </section>

    <AddProvider v-if="adding" :catalog="catalog" @close="adding=false" @select="addProvider"/>
    <Modal compact :open="discard" :title="tr('放弃修改？','Discard changes?')" @close="discard=false"><p>{{tr('丢弃未保存的修改，恢复已保存的配置。','Discard unsaved changes and restore the saved configuration.')}}</p><template #footer><button class="btn" @click="discard=false">{{tr('继续编辑','Keep editing')}}</button><button class="btn danger" @click="discardChanges">{{tr('放弃修改','Discard changes')}}</button></template></Modal>
    <Modal compact :layer="120" :dismissable="!leaveBusy" :open="leave" :title="isMobile?tr('保存修改？','Save changes?'):tr('尚未保存','Unsaved changes')" @close="resolveLeave(false)"><p>{{tr('返回前是否保存已进行的修改？','Save your changes before returning?')}}</p><p v-if="leaveError" class="load-error" role="alert">{{leaveError}}</p><template #footer><button class="btn ghost" :disabled="leaveBusy" @click="resolveLeave(false)">{{tr('继续编辑','Keep editing')}}</button><button class="btn danger" :disabled="leaveBusy" @click="resolveLeave(true)">{{tr('放弃修改','Discard')}}</button><button class="btn primary" :disabled="leaveBusy" @click="saveAndReturn"><Icon v-if="leaveBusy" name="loader-circle" class="spinner"/>{{leaveBusy?tr('保存中…','Saving…'):tr('保存并返回','Save & return')}}</button></template></Modal>
  </div>
    </DialogContent>
  </DialogPortal>
  </DialogRoot>
</template>
<style scoped>
.native-settings { width: 100%; height: 100%; min-height: 0; max-width: 1000px; margin: 0 auto; overflow: hidden; }
.btn-row { display: flex; flex-wrap: wrap; gap: 8px; }
.settings-content { flex: 1; min-height: 0; overflow: auto; padding: 0 24px 24px; }
.add-provider { margin-top: 16px; }
.settings-form { display: grid; gap: 0; margin: 0; padding: 0; min-width: 0; border: 0; }
.settings-form label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.settings-form label:has(input[type=checkbox]) { flex-direction: row; align-items: center; }
.settings-default-note { margin: -4px 0 14px; font-size: 12px; line-height: 1.6; color: var(--fg-subtle); }
.settings-form h2 { font-size: 14px; margin: 0 0 12px; font-weight: 600; }
.provider-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.settings-form dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; }
.settings-form dd { margin: 0; overflow-wrap: anywhere; }
.code { font-family: var(--mono); font-size: calc(1em * var(--mono-scale)); line-height: 1.8; padding: .75em; width: 100%; }
footer { flex: none; display: flex; gap: 12px; border-top: 1px solid var(--line); padding: 12px 24px max(12px, env(safe-area-inset-bottom)); }
.input { min-width: 0; max-width: 100%; }
@media (max-width: 899px) {
  .settings-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .settings-sidebar { width: 100%; padding: 12px 16px; }
}
@media (max-width: 599px) {
  .settings-content { padding: 0 16px 16px; }
  .settings-form { padding: 0; }
  .settings-form dl { grid-template-columns: 1fr; }
  footer { padding-inline: 16px; }
}
 .settings-sidebar { flex: none; padding: 24px 16px; border-bottom: 1px solid var(--line); }
.settings-title { margin: 0 12px 20px; font-size: 18px; font-weight: 600; }
.settings-sidebar nav { display: flex; gap: 6px; flex-wrap: wrap; }
.settings-section { display: flex; align-items: center; gap: 12px; border: 0; background: transparent; color: var(--fg-muted); padding: 12px; border-radius: 8px; text-align: left; cursor: pointer; font: inherit; }
.settings-section:hover { background: var(--bg-hover); }
.settings-section.selected { background: var(--bg-active); color: var(--fg); }
.settings-detail { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.settings-heading { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 8px; flex: none; }
.settings-heading h2 { margin: 0; font-size: 20px; font-weight: 600; }
.settings-overlay { position: fixed; inset: 0; z-index: 50; background: var(--scrim); backdrop-filter: blur(4px); }
@media (min-width: 900px) {
  .native-settings { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(960px, 90vw); height: min(720px, 86dvh); max-width: none; display: flex; flex-direction: row; margin: 0; padding: 0; background: var(--bg-raised); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow-pop); }
  .settings-sidebar { width: 180px; border-bottom: 0; border-right: 1px solid var(--line); background: var(--bg); padding: 20px 12px; }
  .settings-sidebar nav { flex-direction: column; gap: 4px; }
  .settings-title { margin: 0 8px 14px; font-size: 16px; }
  .settings-section { padding: 9px 8px; gap: 8px; }
  .settings-heading h2 { font-size: 18px; }
  .settings-heading { padding: 16px 20px 10px; }
  .settings-content { padding: 0 20px 16px; }
  .settings-form { background: transparent; padding: 0; margin-top: 0; }
  .settings-form label { display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: center; gap: 16px; }
  .settings-form label:has(textarea) { align-items: start; }
  footer { padding: 10px 20px; }
  :deep(.cfg-content) { max-width: none; }
  :deep(.ui-settings .setting-row) { grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding-block: 10px; }
  :deep(.ui-settings .setting-row > :is(.control-select, .choice-capsule, .btn, .cfg-switch)) { justify-self: end; }
  :deep(.cfg-section + .cfg-section) { margin-top: 16px; padding-top: 14px; }

}
@media (max-width: 899px) {
  .native-settings { background: var(--bg-sunken); padding:0; }
  .settings-sidebar { display: block; position: relative; border: 0; padding: 0 16px 24px; overflow: auto; }
  .settings-title { position: static; width: auto; height: auto; clip-path: none; overflow: visible; margin: 0; padding: 0; font-size: 17px; background: transparent; border: 0; }
  .settings-home-heading { margin: 0 -16px 20px; }
  .settings-sidebar nav { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg-raised); }
  .settings-section { min-height: 56px; padding: 14px 16px; border-radius: 0; color: var(--fg); }
  .settings-section + .settings-section { border-top: 1px solid var(--line); }
  .settings-section span { flex: 1; }
  .section-chevron { color: var(--fg-subtle); width: 16px; }
  .settings-heading { justify-content: flex-start; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); background: var(--bg); }
  .settings-heading h2 { font-size: 18px; }
  .settings-content { padding: 16px; }
  .settings-form { margin: 0; gap: 16px; }
  .settings-group { padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); }
  .provider-settings { border-radius: 12px; background: var(--bg-raised); padding: 12px; }
  footer { background: var(--bg); }
  :deep(.ui-settings .cfg-section) { padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); }
}
@media(max-width:899px){
  .settings-title { margin:0; text-align:left; font-size:17px; }
  .settings-heading { min-height:54px; padding:6px 8px; }
  .settings-heading h2 { font-size:17px; }
  .settings-content { padding:20px 16px 24px; }
  .settings-section { padding:14px; gap:12px; }
  .settings-section > .icon:first-child { box-sizing:content-box; padding:8px; background:var(--bg-inset); border-radius:9px; color:var(--fg-muted); }
  .category-description { display:block; margin-top:3px; font-size:12px; color:var(--fg-subtle); font-weight:400; }
  .provider-settings { padding:0; background:transparent; }
  .add-provider.provider-add-card { width:100%; height:74px; margin-top:0; border:0; border-radius:12px; background:var(--bg-raised); color:var(--fg-muted); }
  .add-provider.provider-add-card:hover { background:var(--bg-hover); color:var(--fg); }
  :deep(.ui-settings .cfg-section) { padding:0; border:0; background:transparent; }
  :deep(.ui-settings .cfg-section h2) { padding:0 12px; font-size:12px; color:var(--fg-subtle); font-weight:500; margin-bottom:8px; }
  :deep(.ui-settings .setting-row) { margin:0; padding:12px; min-height:52px; background:var(--bg-raised); gap:8px; }
  :deep(.ui-settings .setting-row:nth-child(2)) { border-radius:12px 12px 0 0; }
  :deep(.ui-settings .setting-row:last-child) { border-radius:0 0 12px 12px; }
  :deep(.ui-settings .setting-row > div:first-child) { flex:1; }
  :deep(.ui-settings .setting-row .setting-help-icon) { display:none; }
  :deep(.ui-settings .cfg-section + .cfg-section) { margin-top:24px; padding-top:0; border:0; }
}
@media(min-width:900px){.settings-home-heading{display:block;padding:0 8px;margin-bottom:20px}.settings-home-heading .settings-title{margin:0}.native-settings{animation:settings-enter 180ms var(--ease-out)}}

</style>
