<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, Trash2 } from '@lucide/vue';
import { isObject, pointer } from '../../core/config-editor';
import type { ConfigCatalog, ConfigEditor, ConfigObject, ProviderPreset } from '../../core/config-editor';
import { fieldLabel, optionalFields, tr } from './fields';
import ConfigLink from './ConfigLink.vue';
import AddOptionalSetting from './AddOptionalSetting.vue';
import Hint from '../../ui/components/Hint.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { settingOption } from './option-help';
import { presetProfile, credentialPresentation } from './preset-profile';
import { protocolPresentation } from '../../ui/protocolPresentation';
import ConfigNode from './ConfigNode.vue';

const props = defineProps<{ value: ConfigObject; path: string[]; preset: ProviderPreset; editor: ConfigEditor; catalog: ConfigCatalog }>();
const profile = computed(() => presetProfile(props.preset));
const protocol = computed(() => String(props.value.protocol || props.preset.protocols[0]));
const defaultAddress = computed(() => props.preset.protocol_base_urls?.[protocol.value] || props.preset.base_url);
const codex = computed(() => isObject(props.value.codex) ? props.value.codex : {});
function setAccountSource(source: string) {
  props.editor.set(fieldPath('codex'), { ...structuredClone(optionalFields(props.path).codex as ConfigObject), ...codex.value, account_id_source: source });
}
const credentials = computed(() => isObject(props.value.credentials) ? props.value.credentials : {});
const credentialFields = computed(() => [...props.preset.required_credentials, ...props.preset.optional_credentials]);
const advancedDefaults = computed<ConfigObject>(() => optionalFields(props.path));
const advanced = computed(() => Object.entries(advancedDefaults.value).filter(([field]) => {
  if (field === 'credentials' || field === 'api_key' || field === 'auth' || (profile.value.local && field === 'base_url')) return false;
  if (field in props.value) return true;
  if (field === 'codex') return profile.value.codex;
  if (field === 'image_edit_path') return protocol.value === 'openai_images';
  return true;
}));
const authRequired = computed(() => props.value.enabled !== false);
const fieldPath = (field: string) => [...props.path, field];
function addAdvanced(field: string) { props.editor.set(fieldPath(field), structuredClone(advancedDefaults.value[field]!)); }
</script>

<template>
  <div class="cfg-object cfg-preset-provider" :data-config-path="pointer(path)" :data-preset="preset.id">
    <ConfigNode v-for="field in ['id', 'preset']" :key="field" :value="value[field] ?? ''" :path="fieldPath(field)" :editor="editor" :catalog="catalog" />
    <section class="preset-section" data-preset-section="connection">
      <header><h4>{{ tr('连接', 'Connection') }}</h4><a v-if="profile.documentation" :href="profile.documentation" target="_blank" rel="noreferrer">{{ tr('官方说明', 'Official documentation') }}</a></header>
      <ConfigNode v-if="preset.protocols.length > 1" :value="protocol" :path="fieldPath('protocol')" :editor="editor" :catalog="catalog" />
      <p v-else class="preset-protocol">{{ protocolPresentation(protocol).label }}</p>
      <ConfigNode v-if="profile.local" :value="value.base_url || defaultAddress" :path="fieldPath('base_url')" :editor="editor" :catalog="catalog" :help="profile.note" />
      <p v-else class="preset-address"><span>{{ tr('预设地址', 'Preset address') }}</span><code>{{ defaultAddress }}</code></p>
      <ConfigNode v-if="profile.workspace" :value="credentials.workspace_id ?? ''" :path="[...path, 'credentials', 'workspace_id']" title="workspace ID" :help="credentialPresentation('workspace_id')?.hint" :required="true" :required-active="value.enabled !== false" :editor="editor" :catalog="catalog" />
      <ConfigNode :value="value.proxy_enabled ?? true" :path="fieldPath('proxy_enabled')" :editor="editor" :catalog="catalog" />
      <p v-if="profile.workspace" class="cfg-hint">{{ profile.note }}</p>
    </section>
    <section class="preset-section" data-preset-section="authentication">
      <header><h4>{{ profile.aws ? 'AWS SigV4' : profile.codex ? tr('ChatGPT 账户认证', 'ChatGPT account authentication') : tr('身份验证', 'Authentication') }}</h4></header>
      <p v-if="profile.note && !profile.local && !profile.workspace" class="cfg-hint">{{ profile.note }}</p>
      <ConfigNode v-if="preset.api_key_supported" :value="value.api_key ?? ''" :path="fieldPath('api_key')" :title="profile.keyLabel" :help="profile.keyHint" :required="preset.api_key_required" :required-active="authRequired" :editor="editor" :catalog="catalog" />
      <p v-if="profile.local" class="cfg-hint">{{ tr('此预设不发送认证信息。', 'This preset sends no authentication information.') }}</p>
      <ConfigNode v-for="field in credentialFields.filter(field => field !== 'workspace_id')" :key="field" :value="credentials[field] ?? ''" :path="[...path, 'credentials', field]" :title="credentialPresentation(field)?.title" :help="credentialPresentation(field)?.hint" :required="preset.required_credentials.includes(field)" :required-active="value.enabled !== false" :editor="editor" :catalog="catalog" />
      <template v-if="profile.codex">
        <div class="cfg-field"><label>{{ tr('账户 ID 来源', 'Account ID source') }}</label><SelectField segmented :model-value="String(codex.account_id_source || 'jwt_claim')" :aria-label="tr('账户 ID 来源', 'Account ID source')" :options="['jwt_claim', 'explicit'].map(value => ({ value, ...settingOption(['account_id_source'], value) }))" @update:model-value="setAccountSource" /></div>
        <ConfigNode v-if="codex.account_id_source === 'explicit'" :value="codex.account_id ?? ''" :path="[...path, 'codex', 'account_id']" title="ChatGPT Account ID" :required="true" :required-active="value.enabled !== false" :editor="editor" :catalog="catalog" />
      </template>
      <p v-if="preset.api_key_supported || credentialFields.length" class="cfg-hint preset-secret-help">{{ tr('凭据支持 ${环境变量名}；未编辑时保留已保存的值。', 'Credentials accept ${ENV_VAR}; saved values are preserved when left unchanged.') }}</p>
    </section>
    <ConfigLink :path="fieldPath('models')" :title="fieldLabel(fieldPath('models'))" />
    <details class="cfg-nested cfg-provider-advanced">
      <summary><ChevronDown :size="16" /><span>{{ tr('高级设置', 'Advanced settings') }}</span></summary>
      <div v-for="[field] in advanced.filter(([field]) => field in value)" :key="field" class="cfg-property cfg-property-removable">
        <template v-if="field in value">
          <ConfigLink v-if="isObject(value[field])" :path="fieldPath(field)" :title="fieldLabel(fieldPath(field))" />
          <ConfigNode v-else :value="value[field]!" :path="fieldPath(field)" :editor="editor" :catalog="catalog" />
          <Hint :text="tr('移除设置', 'Remove override')"><button type="button" class="btn ghost icon-only cfg-remove-field" :aria-label="`${tr('移除设置', 'Remove override')} ${fieldLabel(fieldPath(field))}`" @click="editor.remove(fieldPath(field))"><Trash2 :size="15" /></button></Hint>
        </template>

      </div>
      <AddOptionalSetting :options="advanced.filter(([field]) => !(field in value)).map(([field]) => ({ value: field, label: fieldLabel(fieldPath(field)) }))" @add="addAdvanced" />
    </details>
  </div>
</template>

<style scoped>
.preset-section { margin-block: 14px; padding-block: 14px; border-top: 1px solid var(--line); }
.preset-section header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.preset-section h4 { margin: 0; font: 600 14px/1.5 var(--font); }
.preset-section header a { font-size: 11px; color: var(--fg-subtle); text-underline-offset: 3px; }
.preset-section header a:hover { color: var(--accent); }
.preset-protocol { margin: 10px 0 6px; font-size: 12px; color: var(--fg-subtle); }
.preset-address { display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0 0; font-size: 11px; color: var(--fg-subtle); }
.preset-address code { overflow-wrap: anywhere; }
.preset-secret-help { margin-bottom: 0; }
.preset-section :deep(.cfg-field) { padding-block: 14px; }
</style>
