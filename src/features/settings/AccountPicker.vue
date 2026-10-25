<script setup lang="ts">
import { computed,inject,ref } from 'vue';
import SelectField from '../../ui/components/SelectField.vue';
import AccountEditor from './AccountEditor.vue';
import {configDraftKey} from './useConfigDraft.ts';
import {uniqueId} from '../../core/util/uniqueId.ts';
import {tr} from '../../core/i18n/tr.ts';
const props=defineProps<{modelValue?:string|null;preset?:string;allowed?:string[]}>();
const emit=defineEmits<{'update:modelValue':[value:string|null]}>();
const {draft}=inject(configDraftKey)!;
const editing=ref('');
const options=computed(()=>[{value:'none',label:tr('选择账户','Select account')},...Object.entries<any>(draft.value.accounts??{}).filter(([,a])=>!props.allowed?.length||props.allowed.includes(a.preset)).map(([id,a])=>({value:id,label:a.name||id}))]);
function add(){draft.value.accounts??={};const id=uniqueId(props.preset||'account',id=>id in draft.value.accounts);draft.value.accounts[id]={name:props.preset||tr('新账户','New account'),preset:props.preset||'custom',credentials:{},credentials_env:{},proxy_enabled:true};emit('update:modelValue',id);editing.value=id;}
</script>
<template><div class="account-picker"><SelectField :model-value="modelValue||'none'" :options="options" :aria-label="tr('账户','Account')" @update:model-value="emit('update:modelValue',$event==='none'?null:$event)"/><button class="btn sm" @click="add">{{tr('新增账户','New account')}}</button><button v-if="modelValue" class="btn ghost sm" @click="editing=modelValue">{{tr('编辑','Edit')}}</button></div><AccountEditor v-if="editing" :id="editing" @close="editing=''"/></template>
<style scoped>.account-picker{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.account-picker :deep(.control-select){flex:1;min-width:140px}.btn{flex:none}</style>
