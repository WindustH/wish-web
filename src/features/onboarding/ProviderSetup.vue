<script setup lang="ts">
import { computed } from 'vue';
import { tr } from '../../core/i18n/tr';
import { providerName, presetDescription } from '../../ui/providerPresentation';
import { protocolPresentation } from '../../ui/protocolPresentation';
import { PROTOCOL_OPTIONS } from '../settings/useConfigDraft';
import SelectField from '../../ui/components/SelectField.vue';
import Icon from '../../ui/components/Icon.vue';
import { useProviderSetup } from './useProviderSetup';
const emit = defineEmits<{ complete: [] }>();
const { snapshot, catalog, loading, saving, error, choice, id, model, provider, preset, choose, load, save, setSecret, secretValue } = useProviderSetup();
const options = computed(() => [
  ...Object.keys(snapshot.value?.config.providers ?? {}).map(id => ({ value: `existing:${id}`, label: tr('已有配置 · ', 'Existing · ') + id })),
  ...catalog.value.presets.map(item => ({ value: `preset:${item.id}`, label: `${providerName(item.provider)} · ${presetDescription(item)}`, brand: item.provider })),
  { value: 'custom', label: tr('自定义 / OpenAI 兼容', 'Custom / OpenAI compatible') },
]);
const credentials = computed(() => [...new Set([
  ...(preset.value?.required_credentials ?? []),
  ...(provider.value.auth === 'sig_v4' ? ['region', 'access_key_id', 'secret_access_key', 'session_token'] : []),
])]);
const authOptions = computed(() => [
  { value:'bearer', label:'Bearer token' }, { value:'anthropic_key', label:'Anthropic API Key' },
  { value:'google_key', label:'Google API Key' }, { value:'sig_v4', label:'AWS SigV4' },
  { value:'none', label:tr('无需认证', 'No authentication') },
]);
async function finish() { if (await save()) emit('complete'); }
</script>
<template>
  <main class="provider-setup">
    <div class="setup-content">
      <header>
        <span class="setup-brand" aria-hidden="true">W<span>.</span></span>
        <p class="setup-eyebrow">{{ tr('欢迎使用 WISH', 'WELCOME TO WISH') }}</p>
        <h1>{{ tr('连接你的第一个模型', 'Connect your first model') }}</h1>
        <p class="setup-intro">{{ tr('还没有可用的提供商。完成配置后，就可以开始对话。', 'No provider is ready yet. Set one up to start a conversation.') }}</p>
      </header>
      <p v-if="loading" role="status">{{tr('正在读取配置…', 'Loading configuration…')}}</p>
      <form v-else-if="snapshot" @submit.prevent="finish">
        <fieldset :disabled="saving">
          <label>{{tr('提供商', 'Provider')}}<SelectField searchable :model-value="choice" :options="options" :disabled="saving" @update:model-value="choose" /></label>
          <label>{{tr('服务地址', 'Service URL')}}<input class="input" v-model="provider.base_url" placeholder="https://api.example.com" type="url" required autocomplete="url" /></label>
          <label v-if="!['none', 'sig_v4'].includes(provider.auth)">API Key<input class="input" type="password" :value="secretValue()" @input="setSecret(($event.target as HTMLInputElement).value)" :placeholder="provider.api_key === '<redacted>' ? tr('已配置，留空保留', 'Configured; leave unchanged to retain') : tr('填写密钥或 ${ENV_NAME}', 'API key or ${ENV_NAME}')" autocomplete="new-password" spellcheck="false" /></label>
          <label v-for="field in credentials" :key="field">{{field}}<input class="input" type="password" :value="secretValue(field)" @input="setSecret(($event.target as HTMLInputElement).value, field)" :placeholder="provider.credentials[field] === '<redacted>' ? tr('已配置，留空保留', 'Configured; leave unchanged to retain') : '${ENV_NAME}'" autocomplete="new-password" /></label>
          <label>{{tr('模型 ID', 'Model ID')}}<input class="input" v-model="model" required :placeholder="tr('填写提供商支持的模型 ID', 'Enter a model ID supported by the provider')" autocomplete="off" spellcheck="false" /></label>
          <details class="setup-advanced"><summary>{{tr('连接选项', 'Connection options')}}</summary>
            <label>{{tr('提供商 ID', 'Provider ID')}}<input class="input" v-model="id" required autocomplete="off" spellcheck="false" /></label>
            <label>{{tr('请求协议', 'Request protocol')}}<SelectField v-model="provider.protocol" :disabled="saving" :options="PROTOCOL_OPTIONS.map(value => ({value, ...protocolPresentation(value)}))" /></label>
            <label>{{tr('请求路径', 'Request path')}}<input class="input" v-model="provider.path" required spellcheck="false" /></label>
            <label>{{tr('认证方式', 'Authentication')}}<SelectField v-model="provider.auth" :disabled="saving" :options="authOptions" /></label>
          </details>
        </fieldset>
        <p class="setup-note">{{tr('该模型将设为新会话的默认模型，之后可以在设置中修改。', 'This will be the default model for new conversations. You can change it in settings.')}}</p>
        <p v-if="error" class="load-error" role="alert">{{error}}</p>
        <div class="setup-actions"><button class="btn primary" type="submit" :disabled="saving"><Icon v-if="saving" name="loader-circle" class="spin" />{{ saving ? tr('正在保存…', 'Saving…') : tr('保存并开始', 'Save and start') }}</button><button v-if="error" type="button" class="btn ghost" :disabled="saving" @click="load">{{tr('重新读取配置', 'Reload configuration')}}</button></div>
      </form>
      <template v-else><p class="load-error" role="alert">{{error}}</p><button class="btn" @click="load">{{tr('重试', 'Retry')}}</button></template>
    </div>
  </main>
</template>
<style scoped>
.provider-setup{height:100dvh;overflow-y:auto;overscroll-behavior:contain;background:var(--bg);padding:48px 28px;box-sizing:border-box}
.setup-content{width:min(100%,520px);margin:0 auto;padding-bottom:32px}
.setup-brand{font-family:var(--font-display);font-size:38px;font-weight:700}.setup-brand span{color:var(--accent)}
.setup-eyebrow{margin:28px 0 10px;font-size:11px;letter-spacing:.12em;color:var(--fg-subtle)}
h1{font-size:28px;margin:0 0 12px}.setup-intro{color:var(--fg-subtle);line-height:1.7;margin-bottom:28px}
fieldset{border:0;padding:0;margin:0;display:grid;gap:18px;min-width:0}label{display:grid;gap:8px;font-size:13px}.input{width:100%;box-sizing:border-box;min-height:44px}
.setup-advanced{color:var(--fg-subtle)}summary{cursor:pointer;font-size:13px;padding:6px 0}.setup-advanced label{margin-top:16px;color:var(--fg)}
.setup-note{font-size:12px;color:var(--fg-subtle);line-height:1.7;margin:22px 0}.setup-actions{display:flex;gap:10px;flex-wrap:wrap}.setup-actions .primary{min-height:44px}.load-error{overflow-wrap:anywhere}
@media(max-width:899px){.provider-setup{padding:32px 24px;padding-top:max(32px,env(safe-area-inset-top));padding-bottom:max(32px,env(safe-area-inset-bottom))}h1{font-size:25px}.setup-actions .primary{width:100%}}
</style>
