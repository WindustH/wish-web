<script setup lang="ts">
import { upstreamModelsKey } from './upstream-models';
import Hint from '../../ui/components/Hint.vue';
import { computed, inject, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { ChevronDown, Plus, Trash2 } from '@lucide/vue';
import { atPath, isObject, pointer } from '../../core/config-editor';
import type { ConfigCatalog, ConfigEditor, Json, ProviderPreset } from '../../core/config-editor';
import { fieldLabel, fieldHint, isMap, isSecret, label, newArrayEntry, optionalFields, optionLabel, optionsFor, tr, unit } from './fields';
import ConfigLink from './ConfigLink.vue';
import AddOptionalSetting from './AddOptionalSetting.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { openConfigDialog } from './config-dialog';
import AddProvider from './AddProvider.vue';
import PresetProvider from './PresetProvider.vue';
import { protocolPresentation } from '../../ui/protocolPresentation';
import { settingOption } from './option-help';
import { presetLabel, presetBrand } from '../../ui/providerPresentation';

const props = withDefaults(defineProps<{
  value: Json;
  path: string[];
  editor: ConfigEditor;
  catalog?: ConfigCatalog;
  title?: string;
  help?: string;
  required?: boolean;
  requiredActive?: boolean;
}>(), { required: undefined, requiredActive: undefined });
const openDialog = inject(openConfigDialog)!;
const arrayItem = computed(() => /^\d+$/.test(props.path.at(-1)!));
const hint = computed(() => props.help ?? (arrayItem.value ? '' : fieldHint(props.path)));
const hintId = computed(() => hint.value ? `help-${pointer(props.path)}`
  : arrayItem.value && fieldHint(props.path.slice(0, -1)) ? `help-${pointer(props.path.slice(0, -1))}` : undefined);
const key = computed(() => props.path.at(-1)!);
const name = computed(() => props.title || fieldLabel(props.path));
const upstream = inject(upstreamModelsKey, ref(undefined));
const upstreamForProvider = computed(() => upstream.value?.providerPath === props.path.slice(0, 3).join('/') ? upstream.value.models : {});
const upstreamModel = computed(() => upstreamForProvider.value[props.path[4]!] ?? {});
const inherited = computed(() => props.path[3] === 'models' && props.path.length === 6
  && Object.hasOwn(upstreamModel.value, key.value) && atPath(props.editor.draft.value!, props.path) === undefined);
function ensureModelOverride(path: string[]) {
  if (path[3] !== 'models' || path.length < 6) return;
  const modelPath = path.slice(0, 5);
  if (atPath(props.editor.draft.value!, modelPath) === undefined) props.editor.set(modelPath, {});
  const fieldPath = path.slice(0, 6);
  if (path.length > 6 && atPath(props.editor.draft.value!, fieldPath) === undefined) {
    props.editor.set(fieldPath, structuredClone(upstreamForProvider.value[path[4]!]?.[path[5]!] ?? {}));
  }
}
function removeField(path: string[]) {
  if (path.length <= 6 && atPath(props.editor.draft.value!, path) === undefined) return;
  ensureModelOverride(path);
  props.editor.remove(path);
}
const modelFields = ['context_window_tokens', 'max_output_tokens', 'supports_client_tools', 'supports_reasoning', 'default_reasoning_effort', 'reasoning_efforts'];
const isModel = computed(() => props.path.at(-2) === 'models');
const modelField = computed(() => props.path.at(-3) === 'models' && modelFields.includes(key.value));
const modelNumber = computed(() => modelField.value && ['context_window_tokens', 'max_output_tokens'].includes(key.value));
const modelBoolean = computed(() => modelField.value && ['supports_client_tools', 'supports_reasoning'].includes(key.value));
const object = computed<Record<string, Json> | undefined>(() => isObject(props.value)
  ? isModel.value ? { ...Object.fromEntries(modelFields.map(field => [field, field === 'reasoning_efforts' ? {} : null])), ...upstreamModel.value, ...props.value }
    : key.value === 'models' ? { ...Object.fromEntries(Object.keys(upstreamForProvider.value).map(id => [id, {}])), ...props.value } : props.value
  : undefined);
function removeOverride() {
  if (atPath(props.editor.draft.value!, props.path) !== undefined) props.editor.remove(props.path);
}
const providerPreset = computed(() => props.path.length === 3 && props.path[0] === 'providerd' && props.path[1] === 'providers'
  ? props.catalog?.presets.find(preset => preset.id === object.value?.preset) : undefined);
const optional = computed(() => optionalFields(props.path));
const available = computed(() => Object.keys(optional.value).filter(k => !object.value || !(k in object.value)));
const secret = computed(() => isSecret(props.path, props.value));
const selectOptions = computed(() => optionsFor(props.path, props.editor.draft.value!, props.catalog));
const inputValue = computed(() => props.value === '<redacted>' ? '' : String(props.value ?? ''));
const addKey = ref('');
const mapValueType = ref('string');
const addError = ref('');
const addProviderOpen = ref(false);
const inputType = computed(() => secret.value ? 'password' : (modelNumber.value || typeof props.value === 'number') ? 'number' : 'text');
const floatField = computed(() => /ratio$|multiplier|bytes_per_token/.test(key.value));

function setInput(event: Event) {
  const input = event.target as HTMLInputElement;
  if (modelNumber.value && input.value === '') { removeOverride(); input.value = String(upstreamModel.value[key.value] ?? ''); return; }
  if ((modelNumber.value || typeof props.value === 'number') && !input.checkValidity()) return;
  const value = modelNumber.value || typeof props.value === 'number' ? input.valueAsNumber : input.value;
  // Focusing and leaving a masked field does not clear the existing credential.
  if (secret.value && props.value === '<redacted>' && value === '') return;
  setValue(value);
}
function setValue(value: Json) {
  if (Object.is(props.value, value)) return;
  ensureModelOverride(props.path);
  if (['credentials', 'reasoning_efforts'].includes(props.path.at(-2)!) && atPath(props.editor.draft.value!, props.path.slice(0, -1)) === undefined) {
    props.editor.set(props.path.slice(0, -1), {});
  }
  props.editor.set(props.path, value);
  if (key.value === 'preset' && props.path.at(-3) === 'providers') {
    const parent = props.path.slice(0, -1);
    const preset = props.catalog?.presets.find(item => item.id === value);
    props.editor.set([...parent, 'protocol'], preset?.protocols[0] || '');
    if (preset) {
      for (const field of ['base_url', 'path', 'auth', 'headers', 'query', 'model_list', 'image_edit_path', 'codex']) {
        if (isObject(props.editor.draft.value) && props.editor.draft.value) {
          // Connection overrides belong to the newly chosen preset.
          const current = atPath(props.editor.draft.value, [...parent, field]);
          if (current !== undefined) props.editor.remove([...parent, field]);
        }
      }
    } else {
      props.editor.set([...parent, 'base_url'], '');
    }
    props.editor.set([...parent, 'api_key'], '');
    if (preset?.required_credentials.length) props.editor.set([...parent, 'credentials'], Object.fromEntries(preset.required_credentials.map(name => [name, ''])));
    else if (atPath(props.editor.draft.value!, [...parent, 'credentials']) !== undefined) props.editor.remove([...parent, 'credentials']);
  }
}
function addProvider(preset?: ProviderPreset) {
  const entry = newArrayEntry(props.path);
  if (!isObject(entry) || !Array.isArray(props.value)) throw new Error('Provider editor must be an array');
  if (preset) {
    const ids = new Set(props.value.filter(isObject).map(item => item.id));
    let id = preset.id, suffix = 2;
    while (ids.has(id)) id = `${preset.id}-${suffix++}`;
    entry.id = id;
    entry.preset = preset.id;
    for (const field of ['base_url', 'auth', 'headers', 'query']) delete entry[field];
    entry.protocol = preset.protocols[0]!;
    if (preset.required_credentials.length) entry.credentials = Object.fromEntries(preset.required_credentials.map(name => [name, '']));
  }
  const index = props.value.length;
  props.editor.append(props.path, entry);
  addProviderOpen.value = false;
  openDialog({ path: [...props.path, String(index)], title: String(entry.id || tr('新提供商', 'New provider')) });
}
function displayOption(value: string) {
  if (key.value === 'protocol') return protocolPresentation(value).label;
  if (key.value === 'default_reasoning_effort') return value;
  const preset = key.value === 'preset' && props.catalog?.presets.find(item => item.id === value);
  return preset ? presetLabel(preset) : settingOption(props.path, value).label;
}
function addField() {
  const field = addKey.value.trim();
  if (!field) return;
  if (object.value && Object.hasOwn(object.value, field)) {
    addError.value = tr('这个名称已经存在。', 'This name already exists.');
    return;
  }
  const value = isMap(props.path)
    ? key.value === 'models' ? {} : key.value === 'reasoning_efforts' && mapValueType.value === 'number' ? 0 : ''
    : structuredClone(optional.value[field]);
  ensureModelOverride([...props.path, field]);
  if (key.value === 'reasoning_efforts' && atPath(props.editor.draft.value!, props.path) === undefined) props.editor.set(props.path, {});
  props.editor.set([...props.path, field], value);
  if (key.value === 'models') openDialog({ path: [...props.path, field], title: field });
  addKey.value = '';
  addError.value = '';
}
function addItem() {
  ensureModelOverride([...props.path, String(Array.isArray(props.value) ? props.value.length : 0)]);
  const entry = newArrayEntry(props.path);
  const index = (props.value as Json[]).length;
  props.editor.append(props.path, entry);
  if (isObject(entry)) openDialog({ path: [...props.path, String(index)], title: itemTitle(entry, index) });
}
function itemBrand(item: Json) {
  if (props.path[0] !== 'providerd' || key.value !== 'providers' || !isObject(item)) return undefined;
  return props.catalog?.presets.find(preset => preset.id === item.preset)?.provider;
}
function itemTitle(item: Json, index: number) {
  return isObject(item) && item.id ? String(item.id) : `${tr('项目', 'Item')} ${index + 1}`;
}
</script>

<template>
  <div v-if="Array.isArray(value)" class="cfg-array" :data-config-path="pointer(path)">
    <p v-if="hint" :id="hintId" class="cfg-hint cfg-group-hint">{{ hint }}</p>
    <p v-if="!value.length" class="cfg-hint">{{ tr('尚未添加项目。', 'No items yet.') }}</p>
    <div v-for="(item, index) in value" :key="index" class="cfg-array-item" :class="{ 'cfg-array-row': isObject(item), 'cfg-array-scalar': item === null || typeof item !== 'object' }">
      <ConfigLink v-if="isObject(item)" :path="[...path, String(index)]" :title="itemTitle(item, index)" :brand="itemBrand(item)" :enabled="path[0] === 'providerd' && key === 'providers' ? item.enabled !== false : undefined" @update:enabled="editor.set([...path, String(index), 'enabled'], $event)" @remove="removeField([...path, String(index)])" />
      <ConfigNode v-else :value="item" :path="[...path, String(index)]" :title="`${name} ${index + 1}`" :editor="editor" :catalog="catalog" />
      <button v-if="!(isObject(item) && path[0] === 'providerd' && key === 'providers')" type="button" class="btn ghost cfg-remove" :aria-label="`${tr('删除', 'Remove')} ${itemTitle(item, index)}`" @click="removeField([...path, String(index)])"><Trash2 :size="16" />{{ tr('删除', 'Remove') }}</button>
    </div>
    <button v-if="key === 'providers' && path[0] === 'providerd'" type="button" class="btn" @click="addProviderOpen = true"><Plus :size="16" />{{ tr('添加模型提供商', 'Add provider') }}</button>
    <button v-else type="button" class="btn" @click="addItem"><Plus :size="16" />{{ tr('添加', 'Add') }}{{ name }}</button>
    <AddProvider v-if="addProviderOpen" :catalog="catalog" @close="addProviderOpen = false" @select="addProvider" />
  </div>
  <PresetProvider v-else-if="object && providerPreset" :value="object" :path="path" :preset="providerPreset" :editor="editor" :catalog="catalog!" />
  <div v-else-if="object" class="cfg-object" :data-config-path="pointer(path)">
    <div v-if="modelField && key === 'reasoning_efforts'" class="cfg-field-label">{{ name }}</div>
    <p v-if="hint" :id="hintId" class="cfg-hint cfg-group-hint">{{ hint }}</p>
    <template v-for="(child, field) in object" :key="field">
      <div v-if="!(path.length === 3 && path[0] === 'providerd' && path[1] === 'providers' && field === 'enabled')" class="cfg-property" :class="{ 'cfg-property-removable': (isMap(path) || field in optional) && field !== 'proxy_policy' }">
        <details v-if="path.length === 3 && path[0] === 'providerd' && path[1] === 'providers' && field === 'proxy_policy'" class="cfg-nested">
          <summary><ChevronDown :size="16" /><span>{{ fieldLabel([...path, field]) }}</span><small>{{ settingOption([...path, field], String(child)).label }}</small></summary>
          <ConfigNode :value="child" :path="[...path, field]" :editor="editor" :catalog="catalog" />
        </details>
        <ConfigNode v-else-if="isModel && child !== null && typeof child === 'object'" :value="child" :path="[...path, field]" :editor="editor" :catalog="catalog" />
        <ConfigLink v-else-if="(path[0] === 'providerd' && path[1] === 'providers') && (isObject(child) || (Array.isArray(child) && child.some(isObject)))" :path="[...path, field]" :title="isMap(path) ? field : fieldLabel([...path, field])" />
        <details v-else-if="child !== null && typeof child === 'object'" class="cfg-nested" :open="isMap(path)">
          <summary><ChevronDown :size="16" /><span>{{ isMap(path) ? field : fieldLabel([...path, field]) }}</span><small v-if="Array.isArray(child)">{{ child.length }}</small></summary>
          <ConfigNode :value="child" :path="[...path, field]" :editor="editor" :catalog="catalog" :title="isMap(path) ? field : undefined" />
        </details>
        <ConfigNode v-else :value="child" :path="[...path, field]" :editor="editor" :catalog="catalog" :title="isMap(path) ? field : undefined" />
        <Hint v-if="(isMap(path) || field in optional) && field !== 'proxy_policy' && (atPath(editor.draft.value!, [...path, field]) !== undefined)" :text="tr('移除设置', 'Remove override')"><button type="button" class="btn ghost icon-only cfg-remove-field" :aria-label="`${tr('移除', 'Remove')} ${isMap(path) ? field : fieldLabel([...path, field])}`" @click="removeField([...path, field])"><Trash2 :size="15" /></button></Hint>
      </div>
    </template>
    <AddOptionalSetting v-if="!isMap(path)" :options="available.map(field => ({ value: field, label: label(field) }))" @add="addKey = $event; addField()" />
    <div v-if="isMap(path)" class="cfg-add-field">
      <label :for="`add-${pointer(path)}`">{{ isMap(path) ? tr('添加项目', 'Add entry') : tr('添加可选设置', 'Add optional setting') }}</label>
      <div class="cfg-inline">
        <input class="input" v-if="isMap(path)" :id="`add-${pointer(path)}`" v-model="addKey" :placeholder="key === 'models' ? tr('模型名称，例如 model-name', 'Model ID, e.g. model-name') : tr('名称', 'Name')" @keydown.enter.prevent="addField" />
        <SelectField v-else :id="`add-${pointer(path)}`" v-model="addKey" :placeholder="tr('选择设置', 'Choose setting')" :options="available.map(field => ({ value: field, label: label(field) }))" />
        <SelectField v-if="key === 'reasoning_efforts'" v-model="mapValueType" :aria-label="tr('值的类型', 'Value type')" :options="[{ value: 'string', label: tr('强度名称', 'Effort name') }, { value: 'number', label: tr('Token 数量', 'Token budget') }]" />
        <button type="button" class="btn" :disabled="!addKey.trim()" @click="addField"><Plus :size="16" />{{ tr('添加', 'Add') }}</button>
      </div>
      <p v-if="addKey && !isMap(path) && fieldHint([...path, addKey])" class="cfg-hint">{{ fieldHint([...path, addKey]) }}</p>
      <p v-if="addError" class="cfg-error" role="alert">{{ addError }}</p>
    </div>
  </div>
  <div v-else class="cfg-field" :class="{ 'cfg-field-compact': arrayItem }" :data-config-path="pointer(path)">
    <div class="cfg-field-label">
      <label :for="pointer(path)">{{ name }}<span v-if="required !== undefined" class="cfg-requirement">{{ required ? tr('必填', 'Required') : tr('可选', 'Optional') }}</span></label>
      <small v-if="unit(key)">{{ unit(key) }}</small>
      <p v-if="hint" :id="hintId" class="cfg-hint">{{ hint }}</p>
      <small v-if="inherited">{{ tr('来自上游模型列表', 'From upstream model catalog') }}</small>
    </div>
    <SelectField v-if="modelBoolean" :id="pointer(path)" :aria-describedby="hintId" :model-value="value === null ? 'inherit' : String(value)"
      :options="[{ value: 'inherit', label: tr('使用模型信息', 'Use model metadata') }, { value: 'true', label: tr('支持', 'Supported') }, { value: 'false', label: tr('不支持', 'Not supported') }]"
      @update:model-value="$event === 'inherit' ? removeOverride() : setValue($event === 'true')" />
    <SwitchRoot v-else-if="typeof value === 'boolean'" :id="pointer(path)" :aria-describedby="hintId" :model-value="value" class="cfg-switch" @update:model-value="setValue"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot>
    <div v-else-if="selectOptions" class="cfg-input-wrap">
      <SelectField :id="pointer(path)" :aria-describedby="hintId" :searchable="key === 'preset' || key === 'protocol'" :search-placeholder="tr('搜索名称…', 'Search names…')" :empty-text="tr('没有匹配的选项', 'No matching options')" :model-value="value === null ? '' : String(value)" :placeholder="modelField ? tr('使用默认推理强度', 'Use default effort') : tr('未选择', 'Not selected')"
        :disabled="!selectOptions.some(option => option !== '')"
        :options="[...(value && !selectOptions.includes(String(value)) ? [String(value)] : []), ...selectOptions].filter(option => option !== '').map(option => ({ value: option, label: displayOption(option), description: settingOption(path, option).description, brand: key === 'protocol' ? protocolPresentation(option).brand : key === 'preset' ? presetBrand(option) : undefined, annotation: key === 'protocol' ? protocolPresentation(option).annotation : undefined }))" @update:model-value="setValue" />
      <button v-if="required !== true && value && selectOptions.includes('')" type="button" class="btn ghost" :aria-label="`${tr('清空', 'Clear')} ${name}`" @click="setValue('')">{{ tr('清空', 'Clear') }}</button>
    </div>
    <div v-else class="cfg-input-wrap">
      <input class="input" :id="pointer(path)" :aria-describedby="hintId" :type="inputType" :value="inputValue" :autocomplete="secret ? 'new-password' : 'off'" :spellcheck="false"
        :aria-required="required || undefined"
        :required="required !== undefined ? required && requiredActive !== false && value !== '<redacted>' : typeof value === 'number' || ['id', 'base_url', 'provider', 'model', 'program'].includes(key)"
        :min="modelNumber ? 1 : typeof value === 'number' ? 0 : undefined" :step="typeof value === 'number' ? floatField ? 'any' : '1' : undefined"
        :placeholder="modelNumber ? tr('使用模型信息', 'Use model metadata') : value === '<redacted>' ? tr('已设置；输入新值以更换', 'Set; enter a new value to replace') : ''" @input="setInput" />
      <button v-if="secret && value !== ''" type="button" class="btn ghost" @click="editor.set(path, '')">{{ tr('清空', 'Clear') }}</button>
    </div>
  </div>
</template>
