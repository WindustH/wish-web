<script setup lang="ts">
import {inject,ref} from 'vue';
import AccountEditor from './AccountEditor.vue';
import {configDraftKey} from './useConfigDraft.ts';
import {uniqueId} from '../../core/util/uniqueId.ts';
import {tr} from '../../core/i18n/tr.ts';
const {draft}=inject(configDraftKey)!;const editing=ref('');
function add(){draft.value.accounts??={};const id=uniqueId('account',id=>id in draft.value.accounts);draft.value.accounts[id]={name:tr('新账户','New account'),preset:'custom',credentials:{},credentials_env:{},proxy_enabled:true};editing.value=id;}
function uses(id:string){return [['providers',tr('模型','Model')],['search',tr('搜索','Search')],['fetch',tr('网页读取','Web fetch')]].flatMap(([group,label])=>Object.entries<any>(group==='providers'?draft.value.providers:draft.value[group!]?.providers??{}).filter(([,p])=>p.credential_id===id).map(([key])=>`${label} · ${key}`));}
</script>
<template><section class="set-section"><div class="set-card" v-for="(account,id) in draft.accounts" :key="id"><div class="set-row inline"><span class="set-label"><span>{{account.name||id}}</span><small>{{uses(String(id)).join('、')||tr('尚未关联服务','No linked services')}}</small></span><button class="btn" @click="editing=String(id)">{{tr('编辑','Edit')}}</button><button class="btn ghost" :disabled="uses(String(id)).length>0" @click="delete draft.accounts[id]">{{tr('删除','Delete')}}</button></div></div><button class="provider-add" @click="add">{{tr('添加账户','Add account')}}</button><AccountEditor v-if="editing" :id="editing" @close="editing=''"/></section></template>

<style scoped>
.set-row.inline { grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; }
.set-label small { overflow-wrap: anywhere; }
</style>
