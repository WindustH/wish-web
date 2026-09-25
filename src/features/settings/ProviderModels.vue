<script setup lang="ts">
import { modelLabel } from '../../ui/modelLabel';
import { useMedia } from '../../ui/composables/useMedia';
const isMobile=useMedia('(max-width: 899px)');
import { computed, nextTick, onScopeDispose, ref } from 'vue';
import type { ProviderConfig, ProviderPreset } from '../../core/provider-presets';
import { readCatalogModels } from '../../core/provider-catalog';
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
const allowUnknownId=ref(false);
const catalogOpen=ref(false),catalogBusy=ref(false),catalogError=ref(''),catalog=ref<any[]>([]);
const catalogModal=ref<InstanceType<typeof Modal>>();
let catalogRequest=0;
let catalogController: AbortController | undefined;
onScopeDispose(() => { catalogRequest++; catalogController?.abort(); });
let customAfterCatalog=false;
const advanced=ref(''),advancedChanged=ref(false),editSource=ref('');
const modelDirty=computed(()=>JSON.stringify([modelId.value,draft.value])!==editSource.value||(advancedChanged.value&&advanced.value!==JSON.stringify(draft.value,null,2)));
const returns=useSettingsReturn(()=>isMobile.value&&editing.value,async()=>{if(await confirmModelReturn())editing.value=false;});
async function confirmModelReturn(){return returns.confirm({dirty:()=>modelDirty.value,save:async()=>{const before=JSON.parse(JSON.stringify(props.value.models));if(!apply(false))return false;const saved=await returns.save();if(!saved)props.value.models=before;return saved;},discard:()=>{}});}
const effortsInput=ref('');
const standardEfforts=['minimal','low','medium','high','xhigh','max'];
const defaultReasoningEfforts={low:'low',medium:'medium',high:'high',max:'max'};
function withNewModelDefaults(seed:Record<string,any>){
  const model={...seed};
  if(model.supports_reasoning==null)model.supports_reasoning=true;
  if(model.supports_reasoning!==false&&model.reasoning_efforts==null)model.reasoning_efforts={...defaultReasoningEfforts};
  return model;
}
function sortEfforts(tokens:string[]){
  const order=['off',...standardEfforts];
  return [...tokens].sort((a,b)=>{
    const ia=order.indexOf(a),ib=order.indexOf(b);
    if(ia!==-1&&ib!==-1)return ia-ib;
    if(ia!==-1)return -1;
    if(ib!==-1)return 1;
    return a.localeCompare(b);
  });
}
const presetEfforts=computed(()=>Object.keys(props.preset?.reasoning_efforts??{}));
const isCustomEfforts=computed(()=>draft.value.reasoning_efforts!=null);
const activeEfforts=computed<string[]>(()=>{
  if(draft.value.reasoning_efforts!=null)return Object.keys(draft.value.reasoning_efforts);
  return presetEfforts.value;
});
const commonEffortOptions=computed(()=>sortEfforts([...new Set([...standardEfforts,...presetEfforts.value,...activeEfforts.value].filter(Boolean))]));
function isEffortActive(opt:string){return activeEfforts.value.includes(opt);}

function setEffortsList(list:string[]){
  const tokens=sortEfforts(list.map(s=>s.trim()).filter(Boolean));
  if(!tokens.length){
    draft.value.reasoning_efforts={};
    effortsInput.value='';
  }else{
    const existing=draft.value.reasoning_efforts??{};
    const next:Record<string,any>={};
    for(const t of tokens){
      next[t]=existing[t]??props.preset?.reasoning_efforts?.[t]??t;
    }
    draft.value.reasoning_efforts=next;
    effortsInput.value=tokens.join(', ');
  }
}

function toggleEffort(opt:string){
  const list=[...activeEfforts.value];
  const idx=list.indexOf(opt);
  if(idx>=0)list.splice(idx,1);
  else list.push(opt);
  setEffortsList(list);
}

function onEffortsInput(val:string){
  effortsInput.value=val;
  const trimmed=val.trim();
  if(!trimmed){
    delete draft.value.reasoning_efforts;
    return;
  }
  const tokens=val.split(/[,，\s]+/).map(s=>s.trim()).filter(Boolean);
  const existing=draft.value.reasoning_efforts??{};
  const next:Record<string,any>={};
  for(const t of tokens){
    next[t]=existing[t]??props.preset?.reasoning_efforts?.[t]??t;
  }
  draft.value.reasoning_efforts=next;
}

function resetEfforts(){
  delete draft.value.reasoning_efforts;
  effortsInput.value='';
}

const effortsPlaceholder=computed(()=>{
  if(presetEfforts.value.length){
    return tr('逗号分隔，留空继承预设：','Comma-separated, blank to inherit: ')+presetEfforts.value.join(', ');
  }
  return tr('逗号分隔，如：low, medium, high','Comma-separated, e.g. low, medium, high');
});

const efforts=computed(()=>[...new Set([...Object.keys(draft.value.reasoning_efforts??props.preset?.reasoning_efforts??{}),draft.value.default_reasoning_effort].filter(Boolean))].map(value=>({value,label:value})));
function edit(id='',seed:Record<string,any>={}){originalId.value=id;modelId.value=id;allowUnknownId.value=false;draft.value=JSON.parse(JSON.stringify(id?props.value.models[id]:withNewModelDefaults(seed)));effortsInput.value=draft.value.reasoning_efforts?Object.keys(draft.value.reasoning_efforts).join(', '):'';error.value='';advanced.value=JSON.stringify(draft.value,null,2);advancedChanged.value=false;editSource.value=JSON.stringify([modelId.value,draft.value]);editing.value=true;}
function apply(close=true){try{
  const id=modelId.value.trim();if(!id)throw new Error(tr('请输入模型 ID。','Enter a model ID.'));
  if(id!==originalId.value&&id in props.value.models)throw new Error(tr('模型 ID 已存在。','Model ID already exists.'));
  if(!originalId.value&&catalog.value.length&&!catalog.value.some(model=>model.id===id)&&!allowUnknownId.value){
    const matched=catalog.value.find(model=>modelLabel(model.id).toLowerCase()===id.toLowerCase()||model.name?.toLowerCase()===id.toLowerCase());
    throw new Error(matched
      ? tr(`这是显示名。请使用上游模型 ID：${matched.id}`,`That is a display name. Use upstream model ID: ${matched.id}`)
      : tr('上游目录中没有这个 ID；如确认是自定义模型，请勾选下方选项。','This ID is absent from the upstream catalog. Confirm a custom ID below if intended.'));
  }
  const value=advancedChanged.value?JSON.parse(advanced.value):draft.value;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(tr('模型属性必须是 JSON 对象。','Model metadata must be a JSON object.'));
  if(!originalId.value&&allowUnknownId.value&&catalog.value.length&&!catalog.value.some(model=>model.id===id))value.custom_model_id=true;
  for(const field of ['context_window_tokens','max_output_tokens'])if(value[field]!=null&&(!Number.isSafeInteger(value[field])||value[field]<=0))throw new Error(tr('Token 上限必须是正整数。','Token limits must be positive integers.'));
  if(value.reasoning_efforts!=null&&(typeof value.reasoning_efforts!=='object'||Array.isArray(value.reasoning_efforts)))throw new Error(tr('思考等级必须是对象格式。','Reasoning efforts must be an object.'));
  if(originalId.value&&originalId.value!==id)delete props.value.models[originalId.value];props.value.models[id]=value;if(close)editing.value=false;return true;
}catch(e){error.value=errorText(e);return false;}}
async function readCatalog(){
  const request=++catalogRequest;
  catalogController?.abort();
  catalogController = new AbortController();
  catalogOpen.value=true;catalogBusy.value=true;catalogError.value='';
  try{
    const models = await readCatalogModels(props.id, catalogController.signal);
    if(request===catalogRequest)catalog.value=models;
  }catch(e){if(request===catalogRequest)catalogError.value=tr('读取失败；新增提供商请先保存配置。','Unable to read; save newly added providers first.')+' '+errorText(e);
  }finally{if(request===catalogRequest)catalogBusy.value=false;}
}
function importModel(id:string){
  if(catalogBusy.value||props.value.models[id])return;
  const model=catalog.value.find(item=>item.id===id);
  if(!model)return;
  props.value.models[id]=withNewModelDefaults({context_window_tokens:model.context_window,max_output_tokens:model.max_output_tokens??props.preset?.max_output_tokens,supports_reasoning:model.supports_reasoning,default_reasoning_effort:model.default_reasoning_effort,reasoning_efforts:model.reasoning_efforts});
  catalogOpen.value=false;
}
function openAdd(){if(props.value.model_list)void readCatalog();else edit();}
function openCustom(){customAfterCatalog=true;catalogModal.value?.close();}
function closeCatalog(){
  catalogOpen.value=false;
  if(customAfterCatalog){customAfterCatalog=false;void nextTick(()=>edit());}
}
defineExpose({openAdd});
// Limits read better at the size they were published with: 262144 → 256K, 250000 → 250K.
function tokenLimit(value:number){
  for(const [base,unit] of [[1048576,'M'],[1_000_000,'M'],[1024,'K'],[1000,'K']] as const)if(value>=base&&value%base===0)return `${value/base}${unit}`;
  return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value);
}
function modelFacts(model:Record<string,any>){
  const facts:{label:string;value:string;exact?:string}[]=[];
  if(model.context_window_tokens!=null)facts.push({label:tr('上下文','Context'),value:tokenLimit(model.context_window_tokens),exact:String(model.context_window_tokens)});
  if(model.max_output_tokens!=null)facts.push({label:tr('输出','Output'),value:tokenLimit(model.max_output_tokens),exact:String(model.max_output_tokens)});
  if(model.reasoning_efforts)facts.push({label:tr('思考','Reasoning'),value:Object.keys(model.reasoning_efforts).join(' · ')});
  return facts;
}
const choices=computed(()=>catalog.value.map(model=>({key:model.id,title:modelLabel(model.id),search:model.id,brand:props.preset?.provider,disabled:!!props.value.models[model.id],description:props.value.models[model.id]?tr('已添加','Already added'):undefined})));
</script>
<template>
  <div class="models-editor">
    <p v-if="!Object.keys(value.models).length" class="hint">{{tr('未配置模型，可手动添加或从上游目录选择。','No configured models. Add one manually or choose from the upstream catalog.')}}</p>
    <div v-for="(model,name) in value.models" :key="name" class="model-row">
      <button class="model-edit" :aria-label="tr('编辑模型 ','Edit model ')+name" @click="edit(String(name))"><span class="model-title"><strong>{{modelLabel(String(name))}}</strong><code>{{name}}</code></span><span v-if="modelFacts(model).length" class="model-facts"><span v-for="fact in modelFacts(model)" :key="fact.label" class="model-fact" :title="fact.exact"><span>{{fact.label}}</span>{{fact.value}}</span></span></button>
      <Hint :text="tr('编辑模型','Edit model')"><button class="btn ghost icon-only" :aria-label="tr('编辑模型配置 ','Edit model configuration ')+name" @click="edit(String(name))"><Icon name="pencil"/></button></Hint>
      <Hint :text="tr('删除模型','Delete model')"><button class="btn ghost danger icon-only" :aria-label="tr('删除模型 ','Delete model ')+name" @click="delete value.models[name]"><Icon name="trash-2"/></button></Hint>
    </div>
    <Modal compact :before-close="isMobile?confirmModelReturn:undefined" :content-class="isMobile?'settings-editor mobile-settings-page':'settings-editor'" :page="isMobile" :open="editing" :title="originalId?tr('编辑模型','Edit model'):tr('添加模型','Add model')" @close="editing=false">

      <div class="model-form">
        <p v-if="error" class="load-error" role="alert">{{error}}</p>
        <label>{{tr('模型 ID','Model ID')}}<input class="input" v-model="modelId" autocomplete="off" spellcheck="false"/></label>
        <label v-if="!originalId && catalog.length && modelId.trim() && !catalog.some(model=>model.id===modelId.trim())" class="inline"><input type="checkbox" v-model="allowUnknownId"/>{{tr('确认使用目录外的自定义 ID','Use this custom ID outside the catalog')}}</label>
        <label>{{tr('上下文窗口','Context window')}}<input class="input" type="number" min="1" :value="draft.context_window_tokens??''" @input="draft.context_window_tokens=($event.target as HTMLInputElement).value?Number(($event.target as HTMLInputElement).value):null"/></label>
        <label>{{tr('最大输出 Token','Maximum output tokens')}}<input class="input" type="number" min="1" :value="draft.max_output_tokens??''" @input="draft.max_output_tokens=($event.target as HTMLInputElement).value?Number(($event.target as HTMLInputElement).value):null"/></label>
        <label>{{tr('思考能力','Reasoning support')}}<SelectField mobile-page :model-value="draft.supports_reasoning==null?'unknown':String(draft.supports_reasoning)" :options="[{value:'unknown',label:tr('未指定','Unspecified')},{value:'true',label:tr('支持','Supported')},{value:'false',label:tr('不支持','Unsupported')}]" @update:model-value="$event==='unknown'?delete draft.supports_reasoning:draft.supports_reasoning=$event==='true'"/></label>
        <div v-if="draft.supports_reasoning!==false" class="model-field efforts-field">
          <label for="model-reasoning-efforts">{{tr('支持的思考等级','Supported reasoning efforts')}}</label>
          <div class="efforts-editor">
            <div class="efforts-chips" v-if="commonEffortOptions.length">
              <button
                v-for="opt in commonEffortOptions"
                :key="opt"
                type="button"
                class="chip effort-chip"
                :class="{ active: isEffortActive(opt), inherited: !isCustomEfforts && isEffortActive(opt) }"
                @click="toggleEffort(opt)"
              >{{ opt }}</button>
              <button
                v-if="isCustomEfforts && presetEfforts.length"
                type="button"
                class="chip effort-reset"
                :data-hint="tr('恢复为提供商预设','Reset to provider preset')"
                @click="resetEfforts"
              >
                <Icon name="refresh-cw"/>
                <span>{{ tr('恢复预设','Reset') }}</span>
              </button>
            </div>
            <input
              id="model-reasoning-efforts"
              class="input"
              :value="effortsInput"
              @input="onEffortsInput(($event.target as HTMLInputElement).value)"
              :placeholder="effortsPlaceholder"
            />
          </div>
        </div>
        <label v-if="draft.supports_reasoning!==false">{{tr('默认思考强度','Default reasoning effort')}}<SelectField mobile-page v-if="efforts.length" :model-value="draft.default_reasoning_effort??''" :options="[{value:'',label:tr('上游默认','Upstream default')},...efforts]" @update:model-value="draft.default_reasoning_effort=$event||undefined"/><input v-else class="input" v-model="draft.default_reasoning_effort" :placeholder="tr('上游默认','Upstream default')"/></label>
        <label class="inline"><input type="checkbox" :checked="draft.input_modalities?.includes('image')" @change="draft.input_modalities=($event.target as HTMLInputElement).checked?['text','image']:['text']"/>{{tr('支持图片输入','Supports image input')}}</label>
        <details @toggle="($event.target as HTMLDetailsElement).open&&!advancedChanged&&(advanced=JSON.stringify(draft,null,2))"><summary>{{tr('完整模型属性 JSON','Full model metadata JSON')}}</summary><textarea class="input" rows="10" v-model="advanced" @input="advancedChanged=true"/></details>
      </div>
      <template v-if="!isMobile" #footer><button class="btn" @click="editing=false">{{tr('取消','Cancel')}}</button><button class="btn primary" @click="apply()">{{tr('应用到配置','Apply to configuration')}}</button></template>
    </Modal>
    <Modal ref="catalogModal" compact content-class="catalog-picker" :open="catalogOpen" :title="tr('上游模型目录','Upstream model catalog')" @close="closeCatalog">
      <template #compact-heading>
        <div class="catalog-topline">
          <h2>{{tr('上游模型目录','Upstream model catalog')}}</h2>
          <div class="catalog-toolbar">
            <button class="btn ghost catalog-custom" @click="openCustom">{{tr('自定义','Custom')}}</button>
            <button class="btn ghost icon-only" :disabled="catalogBusy" :aria-label="tr('重新读取','Reload')" :data-hint="tr('重新读取','Reload')" @click="readCatalog"><Icon name="refresh-cw" :class="{spin:catalogBusy}"/></button>
            <button class="btn ghost icon-only" :aria-label="tr('关闭','Close')" :data-hint="tr('关闭','Close')" @click="catalogOpen=false"><Icon name="x"/></button>
          </div>
        </div>
      </template>
      <PickerList :items="choices" :disabled="catalogBusy" :placeholder="tr('搜索模型…','Search models…')" @select="importModel">
        <template #status>
          <p v-if="catalogError" class="catalog-status load-error" role="alert">{{catalogError}}</p>
          <p v-else-if="catalogBusy" class="catalog-status hint" role="status">{{tr('正在读取…','Loading…')}}</p>
        </template>
      </PickerList>
    </Modal>
  </div>
</template>
<style scoped>
.models-editor,.model-form{display:grid;gap:14px}.model-row{display:flex;align-items:center;gap:8px;padding:8px 0}.model-edit{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;align-items:flex-start;border:0;background:transparent;color:inherit;cursor:pointer;text-align:left}.model-edit strong{overflow-wrap:anywhere}
.model-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;min-width:0}.model-title code{font-family:var(--mono);font-size:12px;color:var(--fg-subtle);overflow-wrap:anywhere}
.model-facts{display:flex;flex-wrap:wrap;gap:6px}.model-fact{display:inline-flex;align-items:baseline;gap:6px;padding:2px 8px;border-radius:6px;background:var(--bg-sunken);font-size:12px;line-height:1.6;color:var(--fg-muted);font-variant-numeric:tabular-nums}.model-fact span{color:var(--fg-subtle)}
.model-form label,.model-form .model-field{display:flex;flex-direction:column;gap:6px}.model-form .inline{flex-direction:row;align-items:center}.model-form .input{width:100%;min-width:0}.model-form summary{cursor:pointer}
.efforts-editor{display:flex;flex-direction:column;gap:8px;min-width:0;width:100%}
.efforts-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.effort-chip{cursor:pointer;user-select:none;font-family:var(--font-mono,inherit);display:inline-flex;align-items:center;justify-content:center;padding:5px 12px;min-height:28px;font-size:12px;border-radius:6px;transition:color var(--dur-fast),background var(--dur-fast),border-color var(--dur-fast)}
@media (hover: hover) { .effort-chip:hover:not(.active){background:var(--bg-hover);color:var(--fg)} }
.effort-chip.active{color:var(--accent);background:var(--accent-soft);border-color:var(--accent)}
.effort-chip.inherited{border-style:dashed;opacity:.85}
.effort-reset{cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;min-height:28px;font-size:12px;border-radius:6px;color:var(--fg-subtle);border-style:dashed;transition:color var(--dur-fast),border-color var(--dur-fast),background var(--dur-fast)}
@media (hover: hover) { .effort-reset:hover{color:var(--accent);border-color:var(--accent);background:var(--accent-soft)} }
.effort-reset :deep(.icon){width:13px;height:13px}
.catalog-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.catalog-topline h2{font-size:15px;line-height:1.4;margin:0}
.catalog-toolbar{display:flex;align-items:center;gap:2px}
.catalog-toolbar .btn{width:32px;height:32px;min-height:32px}
.catalog-toolbar .catalog-custom{width:auto;padding:0 9px;font-size:12px}
.catalog-toolbar .icon{width:16px;height:16px}
.catalog-status{margin:0 0 8px;font-size:12px}
:global(.modal-card.catalog-picker){width:min(520px,calc(100vw - 24px));max-height:min(75dvh,560px)}
:global(.modal-card.catalog-picker.compact .modal-body){padding:14px 16px 16px}
:global(.catalog-picker .picker-search){margin-bottom:8px}
@media(min-width:900px){
  .model-form label:not(.inline),.model-form .model-field:not(.inline){display:grid;grid-template-columns:170px minmax(0,1fr);align-items:center;gap:16px}
  .model-form .efforts-field{align-items:start;padding-top:4px}
}
@media(max-width:899px){
.model-form{gap:0;background:var(--bg-raised);border-radius:12px;overflow:hidden}
.model-form>label,.model-form>.model-field{padding:12px 14px;gap:8px;font-size:13px}
.model-form>label+label,.model-form>label+.model-field,.model-form>.model-field+label,.model-form>.model-field+.model-field{border-top:1px solid var(--line)}
.model-form>details{padding:14px;border-top:1px solid var(--line)}
.model-form>details textarea{margin-top:12px}
.model-row{background:var(--bg-raised);border-radius:10px;padding:12px 10px;gap:4px}
.model-edit strong{font-size:14px}.model-title code,.model-fact{font-size:11px}
.efforts-chips{gap:8px}
.effort-chip{min-height:36px;padding:6px 14px;font-size:13px}
.effort-reset{min-height:36px;padding:6px 12px;font-size:13px}
}
</style>
