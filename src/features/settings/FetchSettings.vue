<script setup lang="ts">
import {computed,inject,onMounted,ref} from 'vue';
import {get,post} from '../../core/api/client.ts';
import Modal from '../../ui/components/Modal.vue';
import SelectField from '../../ui/components/SelectField.vue';
import AccountPicker from './AccountPicker.vue';
import SwitchRow from './SwitchRow.vue';
import {useIsMobile} from '../../ui/composables/useMedia.ts';
import {configDraftKey} from './useConfigDraft.ts';
import {uniqueId} from '../../core/util/uniqueId.ts';
import {tr} from '../../core/i18n/tr.ts';
import {showError} from '../../ui/errorDialog.ts';
import {toast} from '../../ui/toast.ts';
const props=defineProps<{save:()=>Promise<boolean>}>();
const {draft}=inject(configDraftKey)!;const mobile=useIsMobile();
const config=computed(()=>draft.value.fetch??={order:[],providers:{}});
const catalog=ref<any[]>([]),editing=ref(''),selected=ref('deepseek_fetch'),checking=ref(false);
const current=computed(()=>config.value.providers[editing.value]);
const spec=(id:string)=>catalog.value.find(p=>p.id===id);
onMounted(async()=>{try{catalog.value=(await get('/fetch-presets')).presets;}catch(error){showError({title:tr('无法读取网页服务','Could not load fetch services'),error});}});
function add(){const id=uniqueId(selected.value,id=>id in config.value.providers);config.value.providers[id]={preset:selected.value,enabled:true,credential_id:null,proxy_enabled:true};config.value.order.push(id);editing.value=id;}
function move(id:string,delta:number){const order=config.value.order;const i=order.indexOf(id),j=i+delta;if(j>=0&&j<order.length)[order[i],order[j]]=[order[j],order[i]];}
function remove(id:string){delete config.value.providers[id];config.value.order=config.value.order.filter((v:string)=>v!==id);editing.value='';}
async function check(){checking.value=true;try{if(!await props.save())return;await post(`/fetch/providers/${encodeURIComponent(editing.value)}/check`,{});toast(tr('网页读取成功','Page fetched successfully'));}catch(error){showError({title:tr('网页读取失败','Fetch failed'),error});}finally{checking.value=false;}}
</script>
<template><section class="set-section"><p class="hint">{{tr('按顺序尝试网页读取服务。账户来自公共账户池；代理和接口地址独立配置。','Services are tried in order. Accounts are shared; proxy and endpoint settings are independent.')}}</p>
<div class="set-card" v-for="(id,index) in config.order" :key="id"><div class="set-row inline"><span class="set-label"><span>{{spec(config.providers[id].preset)?.name||id}}</span><small>{{draft.accounts?.[config.providers[id].credential_id]?.name||tr('未选择账户','No account')}} · {{config.providers[id].enabled?tr('启用','Enabled'):tr('停用','Disabled')}}</small></span><button class="btn ghost sm" :disabled="index===0" @click="move(id,-1)">↑</button><button class="btn ghost sm" :disabled="index===config.order.length-1" @click="move(id,1)">↓</button><button class="btn" @click="editing=id">{{tr('编辑','Edit')}}</button></div></div>
<div class="fetch-add"><SelectField v-model="selected" :options="catalog.map(p=>({value:p.id,label:p.name}))"/><button class="btn" @click="add">{{tr('添加提供商','Add provider')}}</button></div>
<Modal v-if="current" :open="true" :page="mobile" :title="spec(current.preset)?.name||editing" @close="editing=''"><div class="fetch-form"><SwitchRow v-model="current.enabled" :name="tr('启用','Enabled')"/><label>{{tr('账户','Account')}}<AccountPicker v-model="current.credential_id" :preset="({deepseek_fetch:'deepseek',zai_reader:'zai_global',codex_fetch:'openai_codex'} as Record<string,string>)[current.preset]" :allowed="spec(current.preset)?.account_preset?[spec(current.preset).account_preset]:undefined"/></label><label>{{tr('服务地址','Service URL')}}<input class="input" :value="current.base_url??''" @input="current.base_url=($event.target as HTMLInputElement).value.trim()||null" :placeholder="spec(current.preset)?.base_url"/></label><SwitchRow v-model="current.proxy_enabled" :name="tr('使用代理','Use proxy')"/><button class="btn" :disabled="checking" @click="check">{{checking?tr('读取中…','Fetching…'):tr('测试读取','Test fetch')}}</button><button class="btn danger" @click="remove(editing)">{{tr('删除服务','Delete service')}}</button></div></Modal></section></template>
<style scoped>.set-row.inline{grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px}.set-label small{overflow-wrap:anywhere}.fetch-form{display:grid;gap:12px}.fetch-form label{display:grid;gap:6px}.fetch-add{display:flex;gap:8px;margin-top:12px}.fetch-add .btn{flex:none}.hint{color:var(--fg-subtle);font-size:13px}</style>
