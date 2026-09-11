<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import { RefreshCw, Save, RotateCcw, X } from '@lucide/vue';
import { atPath, configEditors, errorText, isObject, loadConfigCatalog } from '../../core/config-editor';
import type { ConfigCatalog, ConfigOwner } from '../../core/config-editor';
import { label, tr } from './fields';
import ConfigNode from './ConfigNode.vue';
import SettingsSections from './SettingsSections.vue';

const props = defineProps<{ owner: ConfigOwner; active: boolean }>();
const editor = configEditors[props.owner];
const { draft, busy, error, dirty, saved, epoch } = editor;
const confirmAction = ref<'reload' | 'discard'>();
const form = ref<HTMLFormElement>();
const catalog = shallowRef<ConfigCatalog>();
const catalogError = shallowRef<unknown>();
const catalogBusy = ref(false);
const root = computed(() => props.owner === 'providerd' ? draft.value?.providerd : draft.value);
const order = props.owner === 'providerd'
  ? ['providers', 'endpoints', 'proxy', 'upstream', 'listen', 'auth', 'http', 'model_catalog_cache_ttl_s']
  : ['wishd', 'streaming', 'agent', 'compaction', 'images', 'queue', 'retry', 'shell'];
const fields = computed(() => isObject(root.value) ? Object.keys(root.value).sort((a, b) => {
  const ai = order.indexOf(a), bi = order.indexOf(b);
  return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
}) : []);
const sections = computed(() => fields.value.map(id => ({ id, label: label(id) })));
const path = (field: string) => props.owner === 'providerd' ? ['providerd', field] : [field];
function revealInvalid(event: Event) {
  let parent = (event.target as HTMLElement).parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
}

async function readCatalog() {
  catalogBusy.value = true;
  catalogError.value = undefined;
  try { catalog.value = await loadConfigCatalog(); }
  catch (cause) { catalogError.value = cause; }
  finally { catalogBusy.value = false; }
}
onMounted(() => {
  if (!editor.source.value) void editor.load();
  if (props.owner === 'providerd') void readCatalog();
});
function request(action: 'reload' | 'discard') {
  if (dirty.value) confirmAction.value = action;
  else if (action === 'reload') void reload();
}
async function reload() {
  await Promise.all([editor.load(), ...(props.owner === 'providerd' ? [readCatalog()] : [])]);
}
async function confirm() {
  const action = confirmAction.value;
  confirmAction.value = undefined;
  if (action === 'reload') await reload();
  else editor.discard();
}
async function save() {
  if (form.value?.reportValidity()) await editor.save();
}
</script>

<template>
  <div class="config-editor" :data-owner="owner">
    <div class="cfg-heading"><p class="cfg-hint">{{ tr('修改后点击保存。需要重启的设置会在保存结果中列出。', 'Save to apply your changes. Settings requiring a restart are listed in the result.') }}</p><button type="button" class="btn" :disabled="busy || catalogBusy" @click="request('reload')"><RefreshCw :size="16" />{{ tr('重新读取', 'Reload') }}</button></div>
    <div v-if="error" class="cfg-notice cfg-error" role="alert"><strong>{{ tr('操作未完成', 'Operation did not complete') }}</strong><p>{{ errorText(error) }}</p><p v-if="dirty">{{ tr('你的修改仍然保留。若配置已被其他地方修改，请重新读取后再编辑。', 'Your edits are retained. If the configuration changed elsewhere, reload before editing again.') }}</p><button v-if="!draft" class="btn" :disabled="busy" @click="editor.load">{{ tr('重试', 'Retry') }}</button></div>
    <div v-if="saved" class="cfg-notice" role="status"><strong>{{ saved.restart_required.length ? tr('配置已保存，部分设置需要重启', 'Saved; some settings require a restart') : tr('配置已保存并应用', 'Configuration saved and applied') }}</strong><ul v-if="saved.restart_required.length"><li v-for="field in saved.restart_required" :key="field">{{ field.split('/').filter(Boolean).map(label).join(' › ') }}</li></ul></div>
    <p v-if="busy && !draft" role="status">{{ tr('正在读取配置…', 'Loading configuration…') }}</p>
    <form v-if="draft" :id="`config-${owner}`" ref="form" @submit.prevent="save" @invalid.capture="revealInvalid">
      <SettingsSections :prefix="owner" :sections="sections">
        <template #before><div v-if="catalogError" class="cfg-notice cfg-error" role="alert">{{ tr('提供方预设读取失败，已有设置仍可编辑。', 'Provider presets could not be loaded; existing settings remain editable.') }}<p>{{ errorText(catalogError) }}</p><button type="button" class="btn" :disabled="catalogBusy" @click="readCatalog">{{ tr('重试', 'Retry') }}</button></div></template>
        <template #default="{ section }">
          <fieldset :disabled="busy" :aria-label="label(section)"><ConfigNode :key="`${epoch}-${section}`" :value="atPath(draft, path(section))!" :path="path(section)" :editor="editor" :catalog="catalog" /></fieldset>
        </template>
      </SettingsSections>
    </form>
    <Teleport to="#settings-actions" defer>
      <Transition name="cfg-savebar">
        <div v-if="active && dirty" class="cfg-savebar" :data-owner="owner">
          <div class="cfg-savebar-inner">
            <span role="status">{{ tr('有未保存的修改', 'You have unsaved changes') }}</span>
            <div class="cfg-savebar-actions">
              <button type="button" class="btn ghost" :disabled="busy" @click="request('discard')"><RotateCcw :size="16" />{{ tr('撤销修改', 'Discard changes') }}</button>
              <button type="submit" :form="`config-${owner}`" class="btn primary" :disabled="busy"><Save :size="16" />{{ busy ? tr('正在保存…', 'Saving…') : tr('保存配置', 'Save configuration') }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <DialogRoot :open="!!confirmAction" @update:open="!$event && (confirmAction = undefined)"><DialogPortal><DialogOverlay class="cfg-dialog-overlay" /><DialogContent class="cfg-dialog"><DialogTitle>{{ tr('放弃尚未保存的修改？', 'Discard unsaved changes?') }}</DialogTitle><DialogDescription>{{ confirmAction === 'reload' ? tr('重新读取会用文件中的配置替换当前草稿。', 'Reloading replaces your draft with the configuration on disk.') : tr('所有未保存的修改都会撤销，包括刚输入的密钥。', 'All unsaved changes, including newly entered credentials, will be discarded.') }}</DialogDescription><div class="cfg-dialog-actions"><button class="btn ghost" @click="confirmAction = undefined">{{ tr('继续编辑', 'Keep editing') }}</button><button class="btn danger" @click="confirm">{{ tr('放弃修改', 'Discard changes') }}</button></div><button class="cfg-dialog-close btn ghost" :aria-label="tr('关闭', 'Close')" @click="confirmAction = undefined"><X :size="18" /></button></DialogContent></DialogPortal></DialogRoot>
  </div>
</template>
