<script setup lang="ts">
import { useMedia } from '../../ui/composables/useMedia';
const isMobile=useMedia('(max-width: 899px)');
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import type { ProviderConfig, ProviderPreset } from '../../core/provider-presets';
import { presetProfile, credentialPresentation } from './preset-profile';
import { presetDescription, providerName } from '../../ui/providerPresentation';
import { protocolPresentation } from '../../ui/protocolPresentation';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import SelectField from '../../ui/components/SelectField.vue';
import AnimatedDetails from '../../ui/components/AnimatedDetails.vue';
import { tr } from './fields';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import Modal from '../../ui/components/Modal.vue';
import { useSettingsReturn } from './settingsReturn';
import ProviderModels from './ProviderModels.vue';
const props=defineProps<{ id:string; value:ProviderConfig; preset?:ProviderPreset; protocols:string[]; initiallyOpen?:boolean; save?:()=>Promise<boolean>; saving?:boolean; saveError?:string }>();
const emit=defineEmits<{remove:[];protocol:[value:string]}>();
const editing=ref(props.initiallyOpen??false);
const mobilePanel=ref('');
const mobileReturning=ref(false);
const modelEditor=ref<InstanceType<typeof ProviderModels>>();
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
function parseEnvironment(value:string){return /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value)?.[1];}
const keyValue=computed(()=>props.value.api_key_env!=null?'${'+props.value.api_key_env+'}':props.value.api_key==='<redacted>'?'':props.value.api_key??'');
function setKey(value:string){
  const environment=parseEnvironment(value);
  props.value.api_key_env=environment??null;
  props.value.api_key=environment?null:value||null;
}
function credentialValue(field:string){
  if(field in props.value.credentials_env)return '${'+props.value.credentials_env[field]+'}';
  return props.value.credentials[field]==='<redacted>'?'':props.value.credentials[field]??'';
}
function setCredential(field:string,value:string){
  const environment=parseEnvironment(value);
  delete props.value.credentials[field];
  delete props.value.credentials_env[field];
  if(environment)props.value.credentials_env[field]=environment;
  else if(value)props.value.credentials[field]=value;
}

</script>
<template>
  <div class="provider-item">
    <button v-if="isMobile" class="mobile-settings-row provider-navigation" @click="mobilePanel='';editing=true"><ProviderIcon :brand="preset?.provider"/><span>{{displayName}}<small class="row-preview">{{Object.keys(value.models).length}} {{tr('个模型','models')}} · {{value.enabled?tr('已启用','Enabled'):tr('已停用','Disabled')}}</small></span><Icon name="chevron-right"/></button>
    <header v-else class="provider-heading">
      <span class="provider-mark"><ProviderIcon :brand="preset?.provider"/></span>
      <div class="provider-identity">
        <div class="provider-title-line"><h2>{{displayName}}</h2><span class="provider-state" :class="{ disabled: !value.enabled }">{{value.enabled?tr('已启用','Enabled'):tr('已停用','Disabled')}}</span></div>
        <small>{{id}}<template v-if="preset"> · {{presetDescription(preset)}}</template></small>
      </div>
      <div class="provider-actions">
        <Hint :text="tr('编辑提供商','Edit provider')"><button class="btn ghost icon-only" :aria-label="tr('编辑提供商 ','Edit provider ')+id" @click="editing=true"><Icon name="pencil"/></button></Hint>
        <Hint :text="tr('删除提供商','Delete provider')"><button class="btn ghost danger icon-only" :aria-label="tr('删除提供商 ','Delete provider ')+id" @click="emit('remove')"><Icon name="trash-2"/></button></Hint>
      </div>
    </header>
    <AnimatedDetails v-if="!isMobile" class="provider-models"><summary><span class="provider-models-label"><Icon name="layers"/>{{tr('模型','Models')}}</span><span class="provider-model-count">{{Object.keys(value.models).length}}</span><button type="button" class="btn ghost icon-only provider-model-add" :aria-label="tr('添加模型','Add model')" :title="tr('添加模型','Add model')" @click.stop.prevent="openModelAdd"><Icon name="plus"/></button><Icon name="chevron-down" class="provider-models-chevron"/></summary><ProviderModels ref="modelEditor" :id="id" :value="value" :preset="preset"/></AnimatedDetails>
    <Modal compact :before-close="isMobile?returns.confirm:undefined" :content-class="isMobile?'settings-editor mobile-settings-page provider-panel':'settings-editor'" :back="isMobile&&mobilePanel?backToProvider:undefined" :page="isMobile" :open="editing" :title="isMobile?(panels.find(p=>p.id===mobilePanel)?.label||displayName):tr('编辑提供商 · ','Edit provider · ')+id" wide @close="closeEditor">

    <p v-if="isMobile&&saveError" class="load-error" role="alert">{{saveError}}</p>
    <div class="provider-form" :key="isMobile?mobilePanel:'desktop'" :class="{'mobile-fields':isMobile,'returning':mobileReturning}">
      <label v-show="!isMobile||!mobilePanel" class="provider-name">{{tr('显示名称','Display name')}}<input class="input" :value="value.display_name??''" :placeholder="preset?providerName(preset.provider):id" @input="value.display_name=($event.target as HTMLInputElement).value||null"/></label>
    <label v-if="!isMobile" class="inline"><input type="checkbox" v-model="value.enabled"/>{{tr('启用此提供商','Enable provider')}}</label>
    <div v-else v-show="!mobilePanel" class="mobile-settings-list">
      <div class="mobile-settings-row"><span>{{tr('启用此提供商','Enable provider')}}</span><SwitchRoot v-model="value.enabled" class="cfg-switch" :aria-label="tr('启用此提供商','Enable provider')"><SwitchThumb class="cfg-switch-thumb"/></SwitchRoot></div>
    </div>
    <nav v-if="isMobile&&!mobilePanel" class="mobile-settings-list"><button v-for="panel in panels" :key="panel.id" class="mobile-settings-row" @click="mobileReturning=false;mobilePanel=panel.id"><span>{{panel.label}}</span><small>{{panel.value}}</small><Icon name="chevron-right"/></button></nav>
    <button v-if="isMobile&&!mobilePanel" class="btn danger mobile-provider-remove" @click="editing=false;emit('remove')"><Icon name="trash-2"/>{{tr('删除提供商','Delete provider')}}</button>
    <ProviderModels v-if="isMobile&&mobilePanel==='models'" ref="modelEditor" :id="id" :value="value" :preset="preset"/>
    <section v-show="!isMobile||mobilePanel==='connection'" class="preset-section">
      <header v-if="!isMobile"><h3>{{tr('连接','Connection')}}</h3><a v-if="profile?.documentation" :href="profile.documentation" target="_blank" rel="noreferrer">{{tr('官方说明','Documentation')}}</a></header>
      <label>{{tr('协议','Protocol')}}<SelectField mobile-page :aria-label="id+' '+tr('协议','Protocol')" :model-value="value.protocol" :options="options([...new Set([...(preset?.protocols??protocols),value.protocol])])" @update:model-value="emit('protocol',$event)"/></label>
      <label v-if="!isMobile" class="inline"><input type="checkbox" v-model="value.proxy_enabled"/>{{tr('使用服务器代理配置','Use server proxy configuration')}}</label>
      <div v-else class="mobile-settings-row"><span>{{tr('使用服务器代理配置','Use server proxy configuration')}}</span><SwitchRoot v-model="value.proxy_enabled" class="cfg-switch" :aria-label="tr('使用服务器代理配置','Use server proxy configuration')"><SwitchThumb class="cfg-switch-thumb"/></SwitchRoot></div>
      <label>{{tr('服务地址','Base URL')}}<input class="input" v-model="value.base_url"/></label>
      <label>{{tr('请求路径','Request path')}}<input class="input" v-model="value.path"/></label>
      <label v-for="field in connectionCredentials" :key="field">{{credentialPresentation(field)?.title||field}}<input class="input" :value="credentialValue(field)" :placeholder="value.credentials[field]==='<redacted>'?tr('已配置，留空保留','Configured; leave unchanged to retain'):tr('直接填写，或使用 ${ENV_NAME}','Enter a value or use ${ENV_NAME}')" autocomplete="off" @input="setCredential(field,($event.target as HTMLInputElement).value)"/></label>
      <p v-if="profile?.note"  class="hint">{{profile.note}}</p>
    </section>
    <section v-show="!isMobile||mobilePanel==='auth'" class="preset-section">
      <h3>{{tr('身份验证','Authentication')}}</h3>
      <p v-if="value.auth!=='none'" class="hint">{{tr('直接填写凭据，或填写 ${ENV_NAME} 引用服务器环境变量。','Enter credentials directly, or use ${ENV_NAME} to reference a server environment variable.')}}</p>
      <label>{{tr('认证方式','Authentication method')}}<SelectField mobile-page v-model="value.auth" :aria-label="id+' '+tr('认证方式','Authentication method')" :options="[{value:'none',label:tr('无需认证','None')},{value:'bearer',label:'Bearer token'},{value:'anthropic_key',label:'Anthropic API Key'},{value:'google_key',label:'Google API Key'},{value:'sig_v4',label:'AWS SigV4'}]"/></label>
      <template v-if="!['none','sig_v4'].includes(value.auth)">
        <label>{{profile?.keyLabel||'API Key'}}<input class="input" :type="value.api_key_env!=null?'text':'password'" :value="keyValue" :placeholder="value.api_key==='<redacted>'?tr('已配置，留空保留','Configured; leave unchanged to retain'):tr('直接填写，或使用 ${ENV_NAME}','Enter a value or use ${ENV_NAME}')" autocomplete="new-password" @input="setKey(($event.target as HTMLInputElement).value)"/><small v-if="profile?.keyHint" class="hint">{{profile.keyHint}}</small></label>
      </template>
      <template v-for="field in credentials" :key="field">
        <label>{{credentialPresentation(field)?.title||field}}
          <input class="input" :type="field in value.credentials_env?'text':'password'" :value="credentialValue(field)" :placeholder="value.credentials[field]==='<redacted>'?tr('已配置，留空保留','Configured; leave unchanged to retain'):tr('直接填写，或使用 ${ENV_NAME}','Enter a value or use ${ENV_NAME}')" :aria-label="credentialPresentation(field)?.title||field" autocomplete="new-password" @input="setCredential(field,($event.target as HTMLInputElement).value)"/>
        </label>
      </template>
    </section>
    <AnimatedDetails v-show="!isMobile||mobilePanel==='advanced'" :open="isMobile" class="preset-section"><summary>{{tr('高级设置','Advanced settings')}}</summary>
      <div class="advanced-fields">
      <label>{{tr('模型列表协议','Catalog protocol')}}<SelectField mobile-page :model-value="value.model_list??''" :options="optional(['openai_models','openai_codex_models','anthropic_models','google_models','qwen_models','bedrock_models'])" @update:model-value="value.model_list=$event||null"/></label>
      <label>{{tr('模型列表地址','Catalog base URL')}}<input class="input" :value="value.model_list_base_url??''" @input="value.model_list_base_url=($event.target as HTMLInputElement).value||null"/></label>
      <label>{{tr('模型列表路径','Catalog path')}}<input class="input" :value="value.model_list_path??''" @input="value.model_list_path=($event.target as HTMLInputElement).value||null"/></label>
      <label>{{tr('Token 计数协议','Token count protocol')}}<SelectField mobile-page :model-value="value.token_count??''" :options="optional(['openai_responses','anthropic_messages','google_generate_content'])" @update:model-value="value.token_count=$event||null"/></label>
      <label>{{tr('上游压缩协议','Upstream compaction protocol')}}<SelectField mobile-page :model-value="value.compaction??''" :options="optional(['openai_responses','openai_responses_streamed'])" @update:model-value="value.compaction=$event||null"/></label>
      <slot/>
      </div>
    </AnimatedDetails>
    <a v-if="isMobile&&mobilePanel==='connection'&&profile?.documentation" class="provider-documentation" :href="profile.documentation" target="_blank" rel="noreferrer">{{tr('官方说明','Documentation')}}<Icon name="external-link"/></a>
    <p v-if="!isMobile&&preset?.unsupported_protocols.length" class="hint">{{tr('图片生成协议尚未接入新后端；此处配置用于模型对话。','Image generation protocols are not connected to the new backend; these presets configure model conversations.')}}</p>
    </div>
    <template #actions><button v-if="isMobile&&mobilePanel==='models'" type="button" class="btn ghost icon-only" :aria-label="tr('添加模型','Add model')" :title="tr('添加模型','Add model')" @click="openModelAdd"><Icon name="plus"/></button></template>
    <template v-if="!isMobile" #footer><span class="hint">{{tr('修改保留在设置草稿中，保存后生效。','Changes remain in the settings draft until saved.')}}</span><button class="btn primary" @click="editing=false">{{tr('完成','Done')}}</button></template>
    </Modal>
  </div>
</template>
<style scoped>
.provider-item{min-width:0;margin-bottom:12px;border:1px solid var(--line);border-radius:12px;background:var(--bg-control);overflow:hidden}
.provider-heading{display:flex;align-items:center;gap:12px;padding:14px 16px}
.provider-mark{display:grid;place-items:center;flex:none;width:40px;height:40px;border:1px solid var(--line);border-radius:10px;background:var(--bg-raised);color:var(--fg)}
.provider-identity{flex:1;min-width:0}
.provider-title-line{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.provider-heading h2{font-size:15px;line-height:1.4;margin:0}
.provider-heading small{display:block;color:var(--fg-subtle);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.provider-state{padding:1px 7px;border-radius:99px;background:var(--accent-soft);color:var(--accent);font-size:11px;line-height:1.5;white-space:nowrap}
.provider-state.disabled{background:var(--bg-raised);color:var(--fg-subtle)}
.provider-actions{display:flex;align-items:center;gap:4px;flex:none}
.provider-models{margin:0}
.provider-models>summary{display:flex;align-items:center;gap:8px;min-height:42px;padding:8px 16px;cursor:pointer;color:var(--fg-muted);font-size:12px;list-style:none;transition:background var(--dur-fast),color var(--dur-fast)}
.provider-models>summary::-webkit-details-marker{display:none}
@media (hover: hover) { .provider-models>summary:hover{background:var(--bg-hover);color:var(--fg)} }
.provider-models-label{display:inline-flex;align-items:center;gap:8px}
.provider-models-label .icon{width:14px;height:14px}
.provider-model-count{min-width:22px;padding:1px 6px;border-radius:5px;background:var(--bg-raised);text-align:center;font-variant-numeric:tabular-nums}
.provider-model-add{width:28px;height:28px;min-height:28px;margin-left:auto;color:var(--fg-subtle)}
.provider-model-add .icon{width:15px;height:15px}
.provider-models-chevron{width:15px;height:15px;margin-left:4px;transition:transform var(--dur-fast)}
.provider-models[open] .provider-models-chevron{transform:rotate(180deg)}
.provider-models :deep(.models-editor){padding:12px 16px 16px}
.preset-section{display:grid;gap:14px;border-top:1px solid var(--line);padding-top:16px;margin-top:16px}.preset-section>header{display:flex;justify-content:space-between;align-items:center}.preset-section h3{font-size:14px;margin:0}.preset-section label{display:grid;grid-template-columns:170px minmax(0,1fr);align-items:center;gap:8px 16px;min-width:0}.preset-section label>small{grid-column:2}.preset-section label.inline{display:flex;flex-direction:row;justify-content:flex-start}.preset-section p{margin:0}.advanced-fields{display:grid;gap:14px;padding-top:14px;min-width:0}.provider-name{display:grid;grid-template-columns:170px minmax(0,1fr);align-items:center;gap:8px 16px}.provider-form>.inline{margin-top:12px}.inline{display:flex;align-items:center;gap:8px;margin-top:16px}.preset-section summary{cursor:pointer;font-weight:500}.model-properties{display:grid;gap:12px;padding:12px;background:var(--bg-sunken);border-radius:8px}.model-properties h4{margin:0}.input{width:100%;min-width:0}a,.hint{font-size:12px;color:var(--fg-subtle)}
@media(max-width:599px){.provider-name{grid-template-columns:1fr}.preset-section label{grid-template-columns:minmax(0,1fr)}.preset-section label>small{grid-column:1}.provider-heading{gap:8px;flex-wrap:wrap}.provider-heading>div{flex-basis:calc(100% - 48px)}.provider-heading small{overflow-wrap:anywhere}}
@media(min-width:900px){.preset-section{gap:10px;padding-top:12px;margin-top:12px}.preset-section .inline{margin-top:0}.provider-form>.inline{margin-top:10px}.advanced-fields{gap:10px;padding-top:10px}}
@media(max-width:899px){.provider-item{padding:0;border:0;background:var(--bg-raised);border-radius:12px;margin-bottom:10px}.provider-navigation{width:100%}.provider-form>.provider-name{display:block;background:var(--bg-raised);padding:12px;border-radius:12px;margin-bottom:16px}.provider-name .input{margin-top:8px}.mobile-provider-remove{width:100%;margin-top:8px;min-height:44px}}
@media(max-width:899px){
 .provider-panel .preset-section{padding:0;gap:0;overflow:hidden}
 .provider-panel .preset-section>header{padding:0 14px}
 .provider-panel .preset-section>header:not(:has(a)){display:none}
 .provider-panel .preset-section label{padding:12px 14px}
 .provider-panel .preset-section .hint{padding:12px 14px}
 .provider-panel .preset-section .mobile-settings-row{border-block:1px solid var(--line)}
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
</style>
