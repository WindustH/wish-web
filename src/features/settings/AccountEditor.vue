<script setup lang="ts">
import { computed, inject, reactive } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import SwitchRow from './SwitchRow.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { configDraftKey } from './useConfigDraft.ts';
import { useChatgptLogin } from './useChatgptLogin.ts';
import { useCopilotLogin } from './useCopilotLogin.ts';
import { secretText, readSecret, writeCredential } from '../../core/secretRef.ts';
import { tr } from '../../core/i18n/tr.ts';
const props=defineProps<{id:string;allowRemove?:boolean}>();
const emit=defineEmits<{close:[];remove:[]}>();
const {draft,catalog,saveConfig,load}=inject(configDraftKey)!;
const mobile=useIsMobile();
const account=computed(()=>draft.value.accounts[props.id]);
const login=reactive(useChatgptLogin(()=>`account:${props.id}`,saveConfig,load));
const copilot=reactive(useCopilotLogin(()=>`account:${props.id}`,saveConfig,load));
const fields=computed(()=>[...new Set([...(catalog.value.presets.find(p=>p.id===account.value.preset)?.required_credentials??[]),...(catalog.value.presets.find(p=>p.id===account.value.preset)?.optional_credentials??[]),...Object.keys(account.value.credentials??{}),...Object.keys(account.value.credentials_env??{})])]);
function key(text:string){const x=readSecret(text,account.value.api_key==='<redacted>'?account.value.api_key:null);account.value.api_key=x.value;account.value.api_key_env=x.env;}
function field(name:string,text:string){writeCredential(account.value.credentials??={},account.value.credentials_env??={},name,text);}
</script>
<template>
<Modal v-if="account" :open="true" :page="mobile" :title="tr('账户','Account')" @close="emit('close')">
 <div class="account-form">
 <label>{{tr('名称','Name')}}<input class="input" v-model="account.name" /></label>
 <label>{{tr('平台 / 账户类型','Platform / account type')}}<SelectField :model-value="account.preset||'custom'" @update:model-value="account.preset=$event" :options="[{value:'custom',label:tr('自定义 API Key','Custom API key')},...catalog.presets.map(p=>({value:p.id,label:p.provider+' · '+p.id}))]" /></label>
 <label>API Key / Access token<input class="input" :type="account.api_key_env?'text':'password'" :value="secretText(account.api_key,account.api_key_env)" :placeholder="tr('输入密钥或 ${ENV_NAME}；留空保留已保存值','Key or ${ENV_NAME}; leave unchanged to retain')" autocomplete="new-password" @input="key(($event.target as HTMLInputElement).value)" /></label>
 <label v-for="name in fields" :key="name">{{name}}<input class="input" type="password" :value="secretText(account.credentials?.[name],account.credentials_env?.[name])" autocomplete="new-password" @input="field(name,($event.target as HTMLInputElement).value)" /></label>
 <template v-if="account.preset==='openai_codex'">
  <button class="btn" :disabled="login.submitting" @click="login.start">{{tr('通过 ChatGPT 登录','Sign in with ChatGPT')}}</button>
  <a v-if="login.url" :href="login.url" target="_blank" rel="noopener noreferrer">{{tr('打开授权页面','Open authorization page')}}</a>
  <p v-if="login.message">{{login.message}}</p>
  <template v-if="login.busy"><input class="input" v-model="login.callbackUrl" :placeholder="tr('粘贴授权后的 localhost 链接','Paste localhost callback URL')"/><button class="btn" @click="login.complete">{{tr('完成登录','Complete sign-in')}}</button></template>
 </template>
 <template v-if="account.preset==='github_copilot'"><button class="btn" @click="copilot.start">{{tr('通过 GitHub 登录','Sign in with GitHub')}}</button><p>{{copilot.message}}</p><strong v-if="copilot.code">{{copilot.code}}</strong><a v-if="copilot.url" :href="copilot.url" target="_blank" rel="noopener noreferrer">{{tr('打开授权页面','Open authorization page')}}</a></template>
 <SwitchRow v-model="account.proxy_enabled" :name="tr('登录与续期使用代理','Use proxy for sign-in and renewal')" />
 <p class="hint">{{tr('此账户由关联服务共享。更换凭据会应用到所有关联服务。','Linked services share this account. Credential changes apply to all linked services.')}}</p>
 </div>
 <template #footer><button v-if="allowRemove!==undefined" class="btn ghost icon-only settings-delete" :disabled="!allowRemove" :aria-label="tr('删除账户','Delete account')" @click="emit('remove')"><Icon :name="allowRemove ? 'trash-2' : 'trash-off'" /></button><button class="btn primary" @click="emit('close')">{{tr('完成','Done')}}</button></template>
</Modal>
</template>
<style scoped>.account-form {display:grid;gap:12px}.account-form label{display:grid;gap:6px;font-size:13px}.hint{color:var(--fg-subtle);font-size:12px}</style>
