<script setup lang="ts">
import { useIsMobile } from '../../ui/composables/useMedia.ts';
const isMobile=useIsMobile();
import { computed, reactive, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import type { ProviderConfig, ProviderPreset } from '../../core/provider-presets.ts';
import { presetProfile, credentialTitle } from './preset-profile.ts';
import { presetDescription, providerName } from '../../ui/providerPresentation.ts';
import { protocolPresentation } from '../../ui/protocolPresentation.ts';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import SelectField from '../../ui/components/SelectField.vue';
import AnimatedDetails from '../../ui/components/AnimatedDetails.vue';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useSettingsReturn } from './settingsReturn.ts';
import ProviderModels from './ProviderModels.vue';
import { ACCOUNT_PROTOCOLS } from '../../core/provider-presets.ts';
import SettingsItemCard, { type ItemState } from './SettingsItemCard.vue';
import { secretText, readSecret, writeCredential, REDACTED } from '../../core/secretRef.ts';
import { useChatgptLogin } from './useChatgptLogin.ts';
// `listTitle` names the provider in the phone list, where no ID is shown beside it.
const props=defineProps<{ id:string; value:ProviderConfig; preset?:ProviderPreset; protocols:string[]; initiallyOpen?:boolean; save?:()=>Promise<boolean>; saving?:boolean; listTitle?:string }>();
const emit=defineEmits<{remove:[];protocol:[value:string];loginComplete:[]}>();
const editing=ref(props.initiallyOpen??false);
const mobilePanel=ref('');
const mobileReturning=ref(false);
const modelEditor=ref<InstanceType<typeof ProviderModels>>();
const login=reactive(useChatgptLogin(()=>props.id,props.save,()=>emit('loginComplete')));
function openModelAdd(){modelEditor.value?.openAdd();}
async function backToProvider(){if(await returns.confirm()){mobileReturning.value=true;mobilePanel.value='';}}
const returns=useSettingsReturn(()=>isMobile.value&&editing.value,async()=>{if(mobilePanel.value)await backToProvider();else if(await returns.confirm())closeEditor();});
function closeEditor(){editing.value=false;}
const displayName=computed(()=>props.value.display_name||(props.preset?providerName(props.preset.provider):props.id));
const panels=computed(()=>[
 {id:'connection',label:tr('连接','Connection'),value:protocolPresentation(props.value.protocol).label},
 {id:'auth',label:tr('身份验证','Authentication'),value:props.value.auth==='none'?tr('无需认证','None'):props.value.auth==='sig_v4'?'AWS SigV4':tr('凭据与认证方式','Credentials')},
 {id:'models',label:tr('模型','Models'),value:String(Object.keys(props.value.models).length)},
 {id:'advanced',label:tr('高级设置','Advanced settings'),value:''},
]);


const state=computed<ItemState>(()=>props.value.enabled?{kind:'ok',text:tr('已启用','Enabled')}:{kind:'disabled',text:tr('已停用','Disabled')});
const profile=computed(()=>props.preset?presetProfile(props.preset):undefined);
const connectionCredentials=computed(()=>props.preset?.required_credentials.filter(field=>field==='workspace_id')??[]);
const credentials=computed(()=>{
  if(props.value.auth==='sig_v4')return ['region','access_key_id','secret_access_key','session_token'];
  if(props.value.auth==='none')return [];
  if(props.value.auth==='bearer' && (props.value.protocol==='codex_responses'||props.preset?.id==='openai_codex'))return ['account_id'];
  return [];
});
const options=(items:string[])=>items.map(value=>({value,...protocolPresentation(value)}));
const optional=(items:string[])=>[{value:'',label:tr('不使用','Disabled')},...options(items)];
const keyValue=computed(()=>secretText(props.value.api_key,props.value.api_key_env));
function setKey(text:string){
  const {value,env}=readSecret(text);
  props.value.api_key_env=env;
  props.value.api_key=value;
}
const credentialValue=(field:string)=>secretText(props.value.credentials[field],props.value.credentials_env[field]);
const setCredential=(field:string,text:string)=>writeCredential(props.value.credentials,props.value.credentials_env,field,text);

</script>
<template>
  <SettingsItemCard class="provider-item" :title="isMobile?(listTitle||displayName):displayName" :summary="`${Object.keys(value.models).length} ${tr('个模型','models')}${preset?' · '+presetDescription(preset):''}`" :state="state" :mobile-state="value.enabled?null:state" :label="id" :edit-hint="tr('编辑提供商','Edit provider')" :remove-hint="tr('删除提供商','Delete provider')" @open="mobilePanel='';editing=true" @remove="emit('remove')">
    <template #mark><ProviderIcon :brand="preset?.provider"/></template>
    <template #detail>{{id}}<template v-if="preset"> · {{presetDescription(preset)}}</template></template>
    <AnimatedDetails v-if="!isMobile" class="provider-models"><summary><span class="provider-models-label"><Icon name="model"/>{{tr('模型','Models')}}</span><span class="provider-model-count">{{Object.keys(value.models).length}}</span><button type="button" class="btn ghost icon-only provider-model-add" :aria-label="tr('添加模型','Add model')" :data-hint="tr('添加模型','Add model')" @click.stop.prevent="openModelAdd"><Icon name="plus"/></button><Icon name="chevron-down" class="provider-models-chevron"/></summary><ProviderModels ref="modelEditor" :id="id" :value="value" :preset="preset"/></AnimatedDetails>
    <Modal compact :before-close="isMobile?returns.confirm:undefined" :content-class="isMobile?'settings-editor mobile-settings-page provider-panel':'settings-editor'" :back="isMobile&&mobilePanel?backToProvider:undefined" :page="isMobile" :open="editing" :title="isMobile?(panels.find(p=>p.id===mobilePanel)?.label||displayName):tr('编辑提供商 · ','Edit provider · ')+id" wide @close="closeEditor">

    <div class="provider-form" :key="isMobile?mobilePanel:'desktop'" :class="{'mobile-fields':isMobile,'returning':mobileReturning}">
      <header v-if="isMobile&&!mobilePanel" class="provider-hero"><span class="provider-mark"><ProviderIcon :brand="preset?.provider"/></span><div><strong>{{displayName}}</strong><small>{{id}}<template v-if="preset"> · {{presetDescription(preset)}}</template></small></div></header>
      <label v-show="!isMobile||!mobilePanel" class="provider-name">{{tr('显示名称','Display name')}}<input class="input" :value="value.display_name??''" :placeholder="preset?providerName(preset.provider):id" @input="value.display_name=($event.target as HTMLInputElement).value||null"/></label>
    <div v-if="!isMobile" class="provider-toggle"><span>{{tr('启用此提供商','Enable provider')}}</span><SwitchRoot v-model="value.enabled" class="cfg-switch" :aria-label="tr('启用此提供商','Enable provider')"><SwitchThumb class="cfg-switch-thumb"/></SwitchRoot></div>
    <div v-else v-show="!mobilePanel" class="mobile-settings-list">
      <div class="mobile-settings-row"><span>{{tr('启用此提供商','Enable provider')}}</span><SwitchRoot v-model="value.enabled" class="cfg-switch" :aria-label="tr('启用此提供商','Enable provider')"><SwitchThumb class="cfg-switch-thumb"/></SwitchRoot></div>
    </div>
    <nav v-if="isMobile&&!mobilePanel" class="mobile-settings-list"><button v-for="panel in panels" :key="panel.id" class="mobile-settings-row" @click="mobileReturning=false;mobilePanel=panel.id"><span>{{panel.label}}</span><small>{{panel.value}}</small><Icon name="chevron-right"/></button></nav>
    <button v-if="isMobile&&!mobilePanel" class="btn danger solid mobile-provider-remove" @click="editing=false;emit('remove')"><Icon name="trash-2"/>{{tr('删除','Delete')}}</button>
    <ProviderModels v-if="isMobile&&mobilePanel==='models'" ref="modelEditor" :id="id" :value="value" :preset="preset"/>
    <section v-show="!isMobile||mobilePanel==='connection'" class="preset-section">
      <header v-if="!isMobile"><h3>{{tr('连接','Connection')}}</h3><a v-if="profile?.documentation" :href="profile.documentation" target="_blank" rel="noreferrer">{{tr('官方说明','Documentation')}}</a></header>
      <label>{{tr('协议','Protocol')}}<SelectField mobile-page :aria-label="id+' '+tr('协议','Protocol')" :model-value="value.protocol" :options="options([...new Set([...(preset?.protocols??protocols),value.protocol])])" @update:model-value="emit('protocol',$event)"/></label>
      <div v-if="!isMobile" class="provider-toggle"><span>{{tr('使用代理','Use proxy')}}</span><SwitchRoot v-model="value.proxy_enabled" class="cfg-switch" :aria-label="tr('使用代理','Use proxy')"><SwitchThumb class="cfg-switch-thumb"/></SwitchRoot></div>
      <div v-else class="mobile-settings-row"><span>{{tr('使用代理','Use proxy')}}</span><SwitchRoot v-model="value.proxy_enabled" class="cfg-switch" :aria-label="tr('使用代理','Use proxy')"><SwitchThumb class="cfg-switch-thumb"/></SwitchRoot></div>
      <label>{{tr('服务地址','Base URL')}}<input class="input" v-model="value.base_url"/></label>
      <label>{{tr('请求路径','Request path')}}<input class="input" v-model="value.path"/></label>
      <label v-for="field in connectionCredentials" :key="field">{{credentialTitle(field)||field}}<input class="input" :value="credentialValue(field)" :placeholder="value.credentials[field]===REDACTED?tr('已配置，留空保留','Configured; leave unchanged to retain'):tr('直接填写，或使用 ${ENV_NAME}','Enter a value or use ${ENV_NAME}')" autocomplete="off" @input="setCredential(field,($event.target as HTMLInputElement).value)"/></label>
      <p v-if="profile?.note"  class="hint">{{profile.note}}</p>
    </section>
    <section v-show="!isMobile||mobilePanel==='auth'" class="preset-section">
      <h3>{{tr('身份验证','Authentication')}}</h3>
      <p v-if="value.auth!=='none'" class="hint">{{tr('直接填写凭据，或填写 ${ENV_NAME} 引用服务器环境变量。','Enter credentials directly, or use ${ENV_NAME} to reference a server environment variable.')}}</p>
      <label>{{tr('认证方式','Authentication method')}}<SelectField mobile-page v-model="value.auth" :aria-label="id+' '+tr('认证方式','Authentication method')" :options="[{value:'none',label:tr('无需认证','None')},{value:'bearer',label:'Bearer token'},{value:'anthropic_key',label:'Anthropic API Key'},{value:'google_key',label:'Google API Key'},{value:'sig_v4',label:'AWS SigV4'}]"/></label>
      <template v-if="!['none','sig_v4'].includes(value.auth)">
        <label>{{profile?.keyLabel||'API Key'}}<input class="input" :type="value.api_key_env!=null?'text':'password'" :value="keyValue" :placeholder="value.api_key===REDACTED?tr('已配置，留空保留','Configured; leave unchanged to retain'):tr('直接填写，或使用 ${ENV_NAME}','Enter a value or use ${ENV_NAME}')" autocomplete="new-password" @input="setKey(($event.target as HTMLInputElement).value)"/><small v-if="profile?.keyHint" class="hint">{{profile.keyHint}}</small></label>
      </template>
      <template v-for="field in credentials" :key="field">
        <label>{{credentialTitle(field)||field}}
          <input class="input" :type="field in value.credentials_env?'text':'password'" :value="credentialValue(field)" :placeholder="value.credentials[field]===REDACTED?tr('已配置，留空保留','Configured; leave unchanged to retain'):tr('直接填写，或使用 ${ENV_NAME}','Enter a value or use ${ENV_NAME}')" :aria-label="credentialTitle(field)||field" autocomplete="new-password" @input="setCredential(field,($event.target as HTMLInputElement).value)"/>
        </label>
      </template>
      <div v-if="profile?.codex" class="chatgpt-login">
        <button type="button" class="btn primary" :disabled="login.submitting||saving" @click="login.start"><Icon name="external-link"/>{{login.busy?tr('重新开始 ChatGPT 登录','Restart ChatGPT sign-in'):tr('通过 ChatGPT 登录','Sign in with ChatGPT')}}</button>
        <a v-if="login.url" :href="login.url" target="_blank" rel="noopener noreferrer">{{tr('重新打开登录页面','Open sign-in page again')}}</a>
        <small v-if="login.message" class="hint" role="status">{{login.message}}</small>
        <div v-if="login.busy" class="chatgpt-manual">
          <small class="hint">{{tr('远程访问时，授权后若出现 localhost 无法连接，请复制浏览器地址栏中的完整链接并粘贴到这里。','If localhost cannot connect after authorization, copy the full URL from your browser address bar and paste it here.')}}</small>
          <div class="chatgpt-manual-input"><input v-model.trim="login.callbackUrl" class="input" type="url" :placeholder="tr('粘贴 localhost 授权链接','Paste the localhost redirect URL')" autocomplete="off" spellcheck="false" @keydown.enter.prevent="login.complete"/><button type="button" class="btn" :disabled="!login.callbackUrl||login.submitting" @click="login.complete">{{login.submitting?tr('验证中…','Verifying…'):tr('完成登录','Complete sign-in')}}</button></div>
        </div>
      </div>
    </section>
    <AnimatedDetails v-show="!isMobile||mobilePanel==='advanced'" :open="isMobile" class="preset-section"><summary><span>{{tr('高级设置','Advanced settings')}}</span><Icon name="chevron-down"/></summary>
      <div class="advanced-fields">
      <label>{{tr('模型列表协议','Catalog protocol')}}<SelectField mobile-page :model-value="value.model_list??''" :options="optional(['openai_models','openai_codex_models','anthropic_models','google_models','qwen_models','bedrock_models'])" @update:model-value="value.model_list=$event||null"/></label>
      <label>{{tr('模型列表地址','Catalog base URL')}}<input class="input" :value="value.model_list_base_url??''" @input="value.model_list_base_url=($event.target as HTMLInputElement).value||null"/></label>
      <label>{{tr('模型列表路径','Catalog path')}}<input class="input" :value="value.model_list_path??''" @input="value.model_list_path=($event.target as HTMLInputElement).value||null"/></label>
      <label>{{tr('Token 计数协议','Token count protocol')}}<SelectField mobile-page :model-value="value.token_count??''" :options="optional(['openai_responses','anthropic_messages','google_generate_content'])" @update:model-value="value.token_count=$event||null"/></label>
      <label>{{tr('上游压缩协议','Upstream compaction protocol')}}<SelectField mobile-page :model-value="value.compaction??''" :options="optional(['openai_responses','openai_responses_streamed'])" @update:model-value="value.compaction=$event||null"/></label>
      <label>{{tr('账户查询协议','Account protocol')}}<SelectField mobile-page :model-value="value.account_state??''" :options="optional(ACCOUNT_PROTOCOLS)" @update:model-value="value.account_state=$event||null"/></label>
      <label>{{tr('账户查询地址','Account base URL')}}<input class="input" :value="value.account_state_base_url??''" :placeholder="tr('留空使用协议默认地址','Empty uses the protocol default')" @input="value.account_state_base_url=($event.target as HTMLInputElement).value||null"/></label>
      <slot/>
      </div>
    </AnimatedDetails>
    <a v-if="isMobile&&mobilePanel==='connection'&&profile?.documentation" class="provider-documentation" :href="profile.documentation" target="_blank" rel="noreferrer">{{tr('官方说明','Documentation')}}<Icon name="external-link"/></a>
    <p v-if="!isMobile&&preset?.unsupported_protocols.length" class="hint">{{tr('图片生成协议尚未接入新后端；此处配置用于模型对话。','Image generation protocols are not connected to the new backend; these presets configure model conversations.')}}</p>
    </div>
    <template #actions><button v-if="isMobile&&mobilePanel==='models'" type="button" class="btn ghost icon-only" :aria-label="tr('添加模型','Add model')" :data-hint="tr('添加模型','Add model')" @click="openModelAdd"><Icon name="plus"/></button></template>
    <template v-if="!isMobile" #footer><span class="hint">{{tr('修改保留在设置草稿中，保存后生效。','Changes remain in the settings draft until saved.')}}</span><button class="btn primary" @click="editing=false">{{tr('完成','Done')}}</button></template>
    </Modal>
  </SettingsItemCard>
</template>
<style scoped>
/* A provider's card beside the shared one: its brand at full strength, its id wrapping rather than cut. */
.provider-item :deep(.settings-item-mark){color:var(--fg)}
.provider-item :deep(.settings-item-heading small){white-space:normal;overflow-wrap:anywhere}
.chatgpt-login{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}.chatgpt-login .btn{display:inline-flex;align-items:center;gap:7px}.chatgpt-login .hint{width:100%}
.chatgpt-manual{width:100%;display:grid;gap:8px}.chatgpt-manual-input{display:flex;gap:8px}.chatgpt-manual-input .input{flex:1;min-width:0}.chatgpt-manual-input .btn{flex:none}@media(max-width:599px){.chatgpt-manual-input{flex-direction:column}}


.provider-mark{display:grid;place-items:center;flex:none;width:40px;height:40px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg)}

.provider-models{margin:0}
.provider-models>summary{display:flex;align-items:center;gap:8px;min-height:42px;padding:8px 16px;cursor:pointer;color:var(--fg-muted);font-size:12px;list-style:none;transition:background var(--dur-fast),color var(--dur-fast)}
.provider-models>summary::-webkit-details-marker{display:none}
@media (hover: hover) { .provider-models>summary:hover{background:var(--bg-hover);color:var(--fg)} }
.provider-models-label{display:inline-flex;align-items:center;gap:8px}
.provider-models-label .icon{width:14px;height:14px}
.provider-model-count{min-width:22px;padding:1px 6px;border-radius:5px;background:var(--bg-sunken);text-align:center;font-variant-numeric:tabular-nums}
.provider-model-add{width:28px;height:28px;min-height:28px;margin-left:auto;color:var(--fg-subtle)}
.provider-model-add .icon{width:15px;height:15px}
.provider-models-chevron{width:15px;height:15px;margin-left:4px;transition:transform var(--dur-fast)}
.provider-models[open] .provider-models-chevron{transform:rotate(180deg)}
.provider-models :deep(.models-editor){padding:12px 16px 16px}
.preset-section{display:grid;gap:14px;border-top:1px solid var(--line);padding-top:16px;margin-top:16px}.preset-section>header{display:flex;justify-content:space-between;align-items:center}.preset-section h3{font-size:14px;margin:0}.preset-section label{display:grid;grid-template-columns:170px minmax(0,1fr);align-items:center;gap:8px 16px;min-width:0}.preset-section label>small{grid-column:2}.preset-section p{margin:0}.advanced-fields{display:grid;gap:14px;padding-top:14px;min-width:0}.provider-name{display:grid;grid-template-columns:170px minmax(0,1fr);align-items:center;gap:8px 16px}.preset-section summary{cursor:pointer;font-weight:500}.input{width:100%;min-width:0}a,.hint{font-size:12px;color:var(--fg-subtle)}
@media(max-width:599px){.provider-name{grid-template-columns:1fr}.preset-section label{grid-template-columns:minmax(0,1fr)}.preset-section label>small{grid-column:1}}
@media(min-width:900px){.preset-section{gap:10px;padding-top:12px;margin-top:12px}.advanced-fields{gap:10px;padding-top:10px}}
@media(max-width:899px){
 /* Providers are rows of one grouped list; dividers start after the icon. */
 
 .provider-hero .provider-mark {width:34px;height:34px;border-radius:10px}
 .provider-hero{display:flex;align-items:center;gap:14px;margin:0 4px 20px}
 .provider-hero .provider-mark{width:52px;height:52px;border-radius:14px}
 .provider-hero .provider-mark :deep(.provider-icon){transform:scale(1.25)}
 .provider-hero div{min-width:0}
 .provider-hero strong{display:block;font-size:19px;font-weight:600;line-height:1.35}
 .provider-hero small{display:block;margin-top:2px;font-size:12px;color:var(--fg-subtle);overflow-wrap:anywhere}
 .provider-form>.provider-name{display:block;margin-bottom:20px;padding:12px 14px;border:0;border-radius:18px;background:var(--bg-group);font-size:13px;color:var(--fg-muted)}
 .provider-name .input{margin-top:8px}
 .mobile-provider-remove{width:100%;min-height:52px;margin-top:0;border-radius:18px}
}
@media(max-width:899px){
 .provider-panel .preset-section{padding:0;gap:0;overflow:hidden}
 .provider-panel .preset-section>header{padding:0 14px}
 .provider-panel .preset-section>header:not(:has(a)){display:none}
 .provider-panel .preset-section label{padding:12px 14px}
 .provider-panel .preset-section>.hint{padding:12px 14px}
 .provider-panel .preset-section label>.hint{display:block;margin-top:8px;line-height:1.6}
 .provider-panel .preset-section>.chatgpt-login{padding:14px;border-top:1px solid var(--line)}
 .provider-panel .chatgpt-login>.btn{width:100%;min-height:44px;justify-content:center}
 .provider-panel .preset-section .mobile-settings-row{border-block:2px solid var(--bg-sunken)}
 .provider-panel .advanced-fields{gap:0}
}
@media(max-width:899px){
 .provider-form.mobile-fields{animation:provider-panel-in 180ms var(--ease-out)}
 .provider-form.mobile-fields.returning{animation-name:provider-panel-back}
}
@keyframes provider-panel-in{from{opacity:.4;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes provider-panel-back{from{opacity:.4;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
.provider-documentation{display:flex;align-items:center;gap:6px;width:fit-content;padding:12px 14px;line-height:1.5;text-decoration:none}
.provider-documentation .icon{width:14px;height:14px}
@media (hover: hover) { .provider-documentation:hover{color:var(--fg)} }
@media(min-width:900px){
 /* The editor groups its fields into the same cards as the settings page. */
 .provider-form{display:grid;gap:16px}
 .provider-form>.provider-name{margin:0;padding:10px 16px;border:1px solid var(--line);border-bottom:0;border-radius:12px 12px 0 0;background:var(--bg-raised);font-weight:500}
 .provider-form>.provider-name+.provider-toggle{margin-top:-16px;border:1px solid var(--line);border-radius:0 0 12px 12px;background:var(--bg-raised)}
 .provider-form>.provider-name+.provider-toggle::before{content:'';position:absolute;left:16px;right:16px;top:-1px;border-top:1px solid var(--line)}
 .provider-toggle{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:52px;padding:8px 16px;font-weight:500}
 .preset-section{gap:0;margin:0;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--bg-raised);overflow:hidden}
 .preset-section>header,.preset-section>h3{margin:0;padding:14px 16px 4px;font-size:13px}
 .preset-section>header h3{font-size:13px}
 .preset-section>header a{font-size:12px}
 .preset-section>:is(label,.provider-toggle,.hint,.chatgpt-login){margin:0;padding:10px 16px}
 .preset-section>:is(label,.provider-toggle)+:is(label,.provider-toggle){border-top:1px solid var(--line)}
 .preset-section>.hint{padding-block:2px 8px;font-size:12px;color:var(--fg-subtle)}
 .preset-section label{font-weight:500}
 .preset-section label>:is(.input,.control-select,small){font-weight:400}
 .preset-section>summary{display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:0 16px;font-size:13px;font-weight:600;list-style:none}
 .preset-section>summary::-webkit-details-marker{display:none}
 .preset-section>summary .icon{width:15px;height:15px;color:var(--fg-subtle);transition:transform var(--dur-fast)}
 .preset-section[open]>summary .icon{transform:rotate(180deg)}
 .advanced-fields{gap:0;padding:0 0 4px}
 .advanced-fields>label{padding:10px 16px;border-top:1px solid var(--line)}
 .advanced-fields :deep(.provider-json){margin:0;padding:4px 16px 12px}
}
</style>
