<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, Plus, Trash2 } from '@lucide/vue';
import { isObject, pointer } from '../../core/config-editor';
import type { ConfigCatalog, ConfigEditor, ConfigObject, ProviderPreset } from '../../core/config-editor';
import { fieldLabel, optionalFields, tr } from './fields';
import ConfigNode from './ConfigNode.vue';

const props = defineProps<{ value: ConfigObject; path: string[]; preset: ProviderPreset; editor: ConfigEditor; catalog: ConfigCatalog }>();
const credentials = computed(() => isObject(props.value.credentials) ? props.value.credentials : {});
const credentialFields = computed(() => [...props.preset.required_credentials, ...props.preset.optional_credentials]);
const advancedDefaults = computed<ConfigObject>(() => ({ model_id_max_bytes: 512, compat: {}, ...optionalFields(props.path) }));
const advanced = computed(() => Object.entries(advancedDefaults.value).filter(([field]) => field !== 'api_key'));
const authRequired = computed(() => props.value.enabled !== false);
const fieldPath = (field: string) => [...props.path, field];
function addAdvanced(field: string) { props.editor.set(fieldPath(field), structuredClone(advancedDefaults.value[field]!)); }
</script>

<template>
  <div class="cfg-object cfg-preset-provider" :data-config-path="pointer(path)" :data-preset="preset.id">
    <ConfigNode v-for="field in ['id', 'preset', 'enabled']" :key="field" :value="value[field] ?? ''" :path="fieldPath(field)" :editor="editor" :catalog="catalog" />
    <ConfigNode v-if="preset.protocols.length > 1" :value="value.protocol ?? preset.protocols[0]!" :path="fieldPath('protocol')" :editor="editor" :catalog="catalog" />
    <div v-if="preset.api_key_supported || credentialFields.length" class="cfg-preset-auth">
      <h4>{{ tr('身份验证', 'Authentication') }}</h4>
      <p v-if="!authRequired" class="cfg-hint">{{ tr('启用此提供商前，需要填写必填认证信息。', 'Required credentials must be supplied before enabling this provider.') }}</p>
      <ConfigNode v-if="preset.api_key_supported" :value="value.api_key ?? ''" :path="fieldPath('api_key')" :required="preset.api_key_required" :required-active="authRequired" :editor="editor" :catalog="catalog" />
      <ConfigNode v-for="field in credentialFields" :key="field" :value="credentials[field] ?? ''" :path="[...path, 'credentials', field]" :required="preset.required_credentials.includes(field)" :required-active="authRequired" :editor="editor" :catalog="catalog" />
    </div>
    <p v-else class="cfg-hint cfg-auth-none">{{ tr('此预设无需认证信息。', 'This preset does not require authentication.') }}</p>
    <ConfigNode v-for="field in ['proxy_policy', 'allow_any_model']" :key="field" :value="value[field]!" :path="fieldPath(field)" :editor="editor" :catalog="catalog" />
    <details class="cfg-nested"><summary><ChevronDown :size="16" /><span>{{ fieldLabel(fieldPath('models')) }}</span></summary><ConfigNode :value="value.models ?? {}" :path="fieldPath('models')" :editor="editor" :catalog="catalog" /></details>
    <details class="cfg-nested cfg-provider-advanced">
      <summary><ChevronDown :size="16" /><span>{{ tr('高级设置', 'Advanced settings') }}</span></summary>
      <div v-for="[field] in advanced" :key="field" class="cfg-property">
        <template v-if="field in value">
          <ConfigNode :value="value[field]!" :path="fieldPath(field)" :editor="editor" :catalog="catalog" />
          <button v-if="field !== 'model_id_max_bytes' && field !== 'compat'" type="button" class="btn ghost cfg-remove-field" @click="editor.remove(fieldPath(field))"><Trash2 :size="15" />{{ tr('移除设置', 'Remove override') }}</button>
        </template>
        <button v-else type="button" class="btn ghost" @click="addAdvanced(field)"><Plus :size="15" />{{ fieldLabel(fieldPath(field)) }}</button>
      </div>
    </details>
  </div>
</template>
