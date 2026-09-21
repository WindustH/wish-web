<script setup lang="ts">
import { useMedia } from '../../ui/composables/useMedia';
const isMobile=useMedia('(max-width: 899px)');
import { computed, ref } from 'vue';
import type { ProviderConfig, ProviderPreset } from '../../core/provider-presets';
import { providerModels } from '../../core/api/endpoints.js';
import { errorText } from '../../core/config-editor';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import Modal from '../../ui/components/Modal.vue';
import PickerList from '../../ui/components/PickerList.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { useSettingsReturn } from './settingsReturn';
import { tr } from './fields';
const props=defineProps<{id:string;value:ProviderConfig;preset?:ProviderPreset}>();
const editing=ref(false),originalId=ref(''),modelId=ref(''),draft=ref<Record<string,any>>({}),error=ref('');
const catalogOpen=ref(false),catalogBusy=ref(false),catalogError=ref(''),catalog=ref<any[]>([]),selected=ref('');
const advanced=ref(''),advancedChanged=ref(false),editSource=ref('');
const modelDirty=computed(()=>JSON.stringify([modelId.value,draft.value])!==editSource.value||(advancedChanged.value&&advanced.value!==JSON.stringify(draft.value,null,2)));
const returns=useSettingsReturn(()=>isMobile.value&&editing.value,async()=>{if(await confirmModelReturn())editing.value=false;});
async function confirmModelReturn(){return returns.confirm({dirty:()=>modelDirty.value,save:async()=>{const before=JSON.parse(JSON.stringify(props.value.models));if(!apply(false))return false;const saved=await returns.save();if(!saved)props.value.models=before;return saved;},discard:()=>{}});}
const efforts=computed(()=>[...new Set([...Object.keys(draft.value.reasoning_efforts??props.preset?.reasoning_efforts??{}),draft.value.default_reasoning_effort].filter(Boolean))].map(value=>({value,label:value})));
function edit(id='',seed:Record<string,any>={}){originalId.value=id;modelId.value=id;draft.value=JSON.parse(JSON.stringify(id?props.value.models[id]:seed));error.value='';advanced.value=JSON.stringify(draft.value,null,2);advancedChanged.value=false;editSource.value=JSON.stringify([modelId.value,draft.value]);editing.value=true;}
function apply(close=true){try{
  const id=modelId.value.trim();if(!id)throw new Error(tr('请输入模型 ID。','Enter a model ID.'));
  if(id!==originalId.value&&id in props.value.models)throw new Error(tr('模型 ID 已存在。','Model ID already exists.'));
  const value=advancedChanged.value?JSON.parse(advanced.value):draft.value;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(tr('模型属性必须是 JSON 对象。','Model metadata must be a JSON object.'));
  for(const field of ['context_window_tokens','max_output_tokens'])if(value[field]!=null&&(!Number.isSafeInteger(value[field])||value[field]<=0))throw new Error(tr('Token 上限必须是正整数。','Token limits must be positive integers.'));
  if(originalId.value&&originalId.value!==id)delete props.value.models[originalId.value];props.value.models[id]=value;if(close)editing.value=false;return true;
}catch(e){error.value=errorText(e);return false;}}
async function readCatalog(){catalogOpen.value=true;catalogBusy.value=true;catalogError.value='';catalog.value=[];selected.value='';try{
  let cursor:string|undefined;do{const page=await providerModels(props.id,{query:{cursor}});catalog.value.push(...page.models);cursor=page.next_cursor;}while(cursor);
}catch(e){catalogError.value=tr('读取失败；新增提供商请先保存配置。','Unable to read; save newly added providers first.')+' '+errorText(e);}finally{catalogBusy.value=false;}}
function importModel(){const model=catalog.value.find(m=>m.id===selected.value);if(!model)return;catalogOpen.value=false;if(props.value.models[model.id])edit(model.id);else{edit('',{display_name:model.name??model.id,context_window_tokens:model.context_window,max_output_tokens:model.max_output_tokens??props.preset?.max_output_tokens});modelId.value=model.id;}}
const choices=computed(()=>catalog.value.map(model=>({key:model.id,title:model.display_name||model.id,description:model.id,brand:props.preset?.provider})));
</script>
<template>
  <div class="models-editor">
    <div class="model-actions"><button class="btn icon-only" :aria-label="tr('添加模型','Add model')" :title="tr('添加模型','Add model')" @click="edit()"><Icon name="plus"/></button><button v-if="value.model_list" class="btn" @click="readCatalog">{{tr('从上游目录添加','Add from upstream catalog')}}</button></div>
    <p v-if="!Object.keys(value.models).length" class="hint">{{tr('未配置模型，可手动添加或从上游目录选择。','No configured models. Add one manually or choose from the upstream catalog.')}}</p>
    <div v-for="(model,name) in value.models" :key="name" class="model-row">
      <button class="model-edit" :aria-label="tr('编辑模型 ','Edit model ')+name" @click="edit(String(name))"><strong>{{model.display_name||name}}</strong><small>{{name}} · {{tr('上下文','Context')}} {{model.context_window_tokens??'—'}} · {{tr('输出','Output')}} {{model.max_output_tokens??'—'}}</small></button>
      <Hint :text="tr('编辑模型','Edit model')"><button class="btn ghost icon-only" :aria-label="tr('编辑模型配置 ','Edit model configuration ')+name" @click="edit(String(name))"><Icon name="pencil"/></button></Hint>
      <Hint :text="tr('删除模型','Delete model')"><button class="btn ghost danger icon-only" :aria-label="tr('删除模型 ','Delete model ')+name" @click="delete value.models[name]"><Icon name="trash-2"/></button></Hint>
    </div>
    <Modal compact :before-close="isMobile?confirmModelReturn:undefined" :content-class="isMobile?'settings-editor mobile-settings-page':'settings-editor'" :page="isMobile" :open="editing" :title="originalId?tr('编辑模型','Edit model'):tr('添加模型','Add model')" @close="editing=false">

      <div class="model-form">
        <p v-if="error" class="load-error" role="alert">{{error}}</p>
        <label>{{tr('模型 ID','Model ID')}}<input class="input" v-model="modelId"/></label>
        <label>{{tr('显示名称','Display name')}}<input class="input" v-model="draft.display_name"/></label>
        <label>{{tr('上下文窗口','Context window')}}<input class="input" type="number" min="1" :value="draft.context_window_tokens??''" @input="draft.context_window_tokens=($event.target as HTMLInputElement).value?Number(($event.target as HTMLInputElement).value):null"/></label>
        <label>{{tr('最大输出 Token','Maximum output tokens')}}<input class="input" type="number" min="1" :value="draft.max_output_tokens??''" @input="draft.max_output_tokens=($event.target as HTMLInputElement).value?Number(($event.target as HTMLInputElement).value):null"/></label>
        <label>{{tr('思考能力','Reasoning support')}}<SelectField mobile-page :model-value="draft.supports_reasoning==null?'unknown':String(draft.supports_reasoning)" :options="[{value:'unknown',label:tr('未指定','Unspecified')},{value:'true',label:tr('支持','Supported')},{value:'false',label:tr('不支持','Unsupported')}]" @update:model-value="$event==='unknown'?delete draft.supports_reasoning:draft.supports_reasoning=$event==='true'"/></label>
        <label>{{tr('默认思考强度','Default reasoning effort')}}<SelectField mobile-page v-if="efforts.length" :model-value="draft.default_reasoning_effort??''" :options="[{value:'',label:tr('上游默认','Upstream default')},...efforts]" @update:model-value="draft.default_reasoning_effort=$event||undefined"/><input v-else class="input" v-model="draft.default_reasoning_effort" :placeholder="tr('上游默认','Upstream default')"/></label>
        <label class="inline"><input type="checkbox" :checked="draft.input_modalities?.includes('image')" @change="draft.input_modalities=($event.target as HTMLInputElement).checked?['text','image']:['text']"/>{{tr('支持图片输入','Supports image input')}}</label>
        <details @toggle="($event.target as HTMLDetailsElement).open&&!advancedChanged&&(advanced=JSON.stringify(draft,null,2))"><summary>{{tr('完整模型属性 JSON','Full model metadata JSON')}}</summary><textarea class="input" rows="10" v-model="advanced" @input="advancedChanged=true"/></details>
      </div>
      <template v-if="!isMobile" #footer><button class="btn" @click="editing=false">{{tr('取消','Cancel')}}</button><button class="btn primary" @click="apply()">{{tr('应用到配置','Apply to configuration')}}</button></template>
    </Modal>
    <Modal :page="isMobile" :open="catalogOpen" :title="tr('上游模型目录','Upstream model catalog')" @close="catalogOpen=false">
      <p v-if="catalogError" class="load-error" role="alert">{{catalogError}}</p><p v-if="catalogBusy">{{tr('正在读取…','Loading…')}}</p><PickerList v-model="selected" :items="choices" :placeholder="tr('搜索模型…','Search models…')"/>
      <template #footer><button class="btn" :disabled="catalogBusy" @click="readCatalog">{{tr('重新读取','Reload')}}</button><button class="btn primary" :disabled="!selected" @click="importModel">{{tr('选择模型','Choose model')}}</button></template>
    </Modal>
  </div>
</template>
<style scoped>
.models-editor,.model-form{display:grid;gap:14px}.model-actions{display:flex;gap:8px;flex-wrap:wrap}.model-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line);padding:8px 0}.model-row:not(:has(~ .model-row)){border-bottom:0}.model-edit{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;align-items:flex-start;border:0;background:transparent;color:inherit;cursor:pointer;text-align:left}.model-edit strong{overflow-wrap:anywhere}.model-edit small{color:var(--fg-subtle);overflow-wrap:anywhere}.model-form label{display:flex;flex-direction:column;gap:6px}.model-form .inline{flex-direction:row;align-items:center}.model-form .input{width:100%;min-width:0}.model-form summary{cursor:pointer}
@media(min-width:900px){.model-form label:not(.inline){display:grid;grid-template-columns:170px minmax(0,1fr);align-items:center;gap:16px}}
@media(max-width:899px){
.model-form{gap:0;background:var(--bg-raised);border-radius:12px;overflow:hidden}
.model-form>label{padding:12px 14px;gap:8px;font-size:13px}
.model-form>label+label{border-top:1px solid var(--line)}
.model-form>details{padding:14px;border-top:1px solid var(--line)}
.model-form>details textarea{margin-top:12px}
.model-actions .btn{min-height:44px}
.model-actions .btn.icon-only{width:44px;height:44px;flex:none}
.model-row{background:var(--bg-raised);border-radius:10px;padding:12px 10px;gap:4px}
.model-edit strong{font-size:14px}.model-edit small{font-size:11px}
}
</style>
