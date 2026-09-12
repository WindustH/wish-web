<script setup lang="ts">
import { usePageActivity } from '../../ui/composables/usePageActivity';
const pageActive = usePageActivity();
import { computed, onMounted, provide, ref, shallowRef } from 'vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
import { RefreshCw, Save, RotateCcw, X } from '@lucide/vue';
import { atPath, configEditors, errorText, isObject, loadConfigCatalog } from '../../core/config-editor';
import type { ConfigCatalog, ConfigOwner, ConfigPreview } from '../../core/config-editor';
import { fieldLabel, label, tr } from './fields';
import { configFailure } from './config-errors';
import Modal from '../../ui/components/Modal.vue';
import { openConfigDialog } from './config-dialog';
import type { ConfigDialogTarget } from './config-dialog';
import ConfigNode from './ConfigNode.vue';
import SettingsSections from './SettingsSections.vue';

const props = defineProps<{ owner: ConfigOwner; active: boolean }>();
const editor = configEditors[props.owner];
const editing = ref<ConfigDialogTarget[]>([]);
const current = computed(() => editing.value.at(-1));
function openEditor(target: ConfigDialogTarget) { editing.value.push(target); }
provide(openConfigDialog, openEditor);
function closeEditor() { editing.value = []; }
function revealPath(path: string[]) {
  let parent = path.slice(0, -1);
  const provider = path[0] === 'providerd' && path[1] === 'providers'
    ? atPath(editor.draft.value!, path.slice(0, 3)) : undefined;
  // Preset credential controls carry required/optional semantics in their
  // provider form. Search must open that form, not a generic credentials map.
  if (isObject(provider) && provider.preset && path[3] !== 'models') parent = path.slice(0, 3);
  editing.value = [{ path: parent, title: parent.length === 3 && isObject(provider)
    ? String(provider.id) : fieldLabel(parent) }];
}
defineExpose({ revealPath, validate: () => !!form.value?.reportValidity() && (!dialogForm.value || dialogForm.value.reportValidity()) });
const { draft, busy, error, dirty, saved, epoch, restartState } = editor;
const failure = computed(() => configFailure(error.value, editor.errorStage.value));
const confirmAction = ref<'reload' | 'discard'>();
const restartReview = ref<ConfigPreview>();
const form = ref<HTMLFormElement>();
const dialogForm = ref<HTMLFormElement>();
const catalog = shallowRef<ConfigCatalog>();
const catalogError = shallowRef<unknown>();
const catalogBusy = ref(false);
const root = computed(() => props.owner === 'providerd' ? draft.value?.providerd : draft.value);
const order = props.owner === 'providerd'
  ? ['providers', 'proxy', 'upstream', 'listen', 'auth', 'http', 'model_catalog_cache_ttl_s']
  : ['wishd', 'streaming', 'agent', 'compaction', 'images', 'attachments', 'queue', 'retry', 'shell'];
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
  if (!form.value?.reportValidity() || (dialogForm.value && !dialogForm.value.reportValidity())) return;
  const preview = await editor.preview();
  if (!preview) return;
  if (preview.restart_required.length) restartReview.value = preview;
  else await editor.save();
}
async function confirmSave(restart: boolean) {
  restartReview.value = undefined;
  await editor.save(restart);
}
</script>

<template>
  <div class="config-editor" :data-owner="owner">
    <div class="cfg-heading cfg-heading-actions"><button type="button" class="btn" :disabled="busy || catalogBusy" @click="request('reload')"><RefreshCw :size="16" />{{ tr('重新读取', 'Reload') }}</button></div>
    <div v-if="error" class="cfg-notice cfg-error" role="alert"><strong>{{ failure.title }}</strong><p>{{ failure.detail }}</p><p v-if="dirty">{{ failure.hint }}</p><button v-if="!draft" class="btn" :disabled="busy" @click="editor.load">{{ tr('重试', 'Retry') }}</button></div>
    <div v-if="saved" class="cfg-notice" role="status"><strong>{{ restartState === 'waiting' ? tr('配置已保存，正在重启…', 'Configuration saved. Restarting…') : restartState === 'complete' ? tr('配置已保存并重启', 'Configuration saved and restarted') : restartState === 'failed' ? tr('配置已保存，但未能确认重启完成', 'Configuration saved, but restart could not be confirmed') : saved.restart_required.length ? tr('配置已保存，待重启生效', 'Configuration saved; restart to apply') : tr('配置已保存并应用', 'Configuration saved and applied') }}</strong><p v-if="restartState === 'failed'">{{ tr('若修改了监听地址或认证信息，请更新连接设置后重新连接。', 'If the listen address or authentication changed, update the connection settings and reconnect.') }}</p></div>
    <p v-if="busy && !draft" role="status">{{ tr('正在读取配置…', 'Loading configuration…') }}</p>
    <form v-if="draft" :id="`config-${owner}`" ref="form" @submit.prevent="save" @invalid.capture="revealInvalid">
      <SettingsSections :prefix="owner" :sections="sections">
        <template #before><div v-if="catalogError" class="cfg-notice cfg-error" role="alert">{{ tr('提供商预设读取失败，已有设置仍可编辑。', 'Provider presets could not be loaded; existing settings remain editable.') }}<p>{{ errorText(catalogError) }}</p><button type="button" class="btn" :disabled="catalogBusy" @click="readCatalog">{{ tr('重试', 'Retry') }}</button></div></template>
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
              <button type="button" class="btn ghost" :disabled="busy" @click="request('discard')"><RotateCcw :size="16" />{{ tr('放弃修改', 'Discard changes') }}</button>
              <button type="submit" :form="`config-${owner}`" class="btn primary" :disabled="busy"><Save :size="16" />{{ busy ? tr('正在保存…', 'Saving…') : tr('保存配置', 'Save configuration') }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <Modal :open="!!current" :title="current?.title || ''" wide :dismissable="!busy" @close="closeEditor">
      <form v-if="current && draft" ref="dialogForm" class="config-editor cfg-editor-window" @submit.prevent @invalid.capture="revealInvalid">
        <div v-if="error" class="cfg-notice cfg-error" role="alert"><strong>{{ failure.title }}</strong><p>{{ failure.detail }}</p><p v-if="dirty">{{ failure.hint }}</p></div>
        <div v-if="saved" class="cfg-notice" role="status">{{ tr('配置已保存', 'Configuration saved') }}</div>
        <fieldset :disabled="busy"><ConfigNode :key="`${epoch}-${current.path.join('/')}`" :value="atPath(draft, current.path) ?? {}" :path="current.path" :editor="editor" :catalog="catalog" /></fieldset>
      </form>
      <template #footer>
        <div class="cfg-window-actions">
          <button v-if="editing.length > 1" type="button" class="btn ghost" :disabled="busy" @click="editing.pop()">{{ tr('返回上一级', 'Back') }}</button>
          <span v-if="dirty" class="cfg-hint">{{ tr('有未保存的修改', 'You have unsaved changes') }}</span>
          <div class="grow" />
          <button type="button" class="btn" :disabled="busy" @click="closeEditor">{{ tr('关闭', 'Close') }}</button>
        </div>
      </template>
    </Modal>
    <DialogRoot :open="!!restartReview" @update:open="!$event && (restartReview = undefined)"><DialogPortal v-if="pageActive"><DialogOverlay class="cfg-dialog-overlay" /><DialogContent class="cfg-dialog cfg-restart-dialog"><DialogTitle>{{ tr('这些修改需要重启后生效', 'These changes require a restart') }}</DialogTitle><DialogDescription>{{ tr('配置尚未保存。立即重启会中断此服务正在处理的请求；核心服务的运行中会话会停止，稍后可继续。', 'The configuration has not been saved. Restarting interrupts requests handled by this service; running Core sessions stop and can be continued later.') }}</DialogDescription><ul><li v-for="field in restartReview?.restart_required" :key="field">{{ field.split('/').filter(Boolean).map(label).join(' › ') }}</li></ul><p v-if="restartReview?.restart_required.some(field => field.includes('/listen/') || field.includes('/auth/'))">{{ tr('更改监听地址或认证信息后，可能需要更新连接设置。', 'Changing the listen address or authentication may require updating connection settings.') }}</p><p v-if="!restartReview?.restart_supported">{{ tr('此平台不支持从网页重启，请保存后自行重启。', 'Restarting from the Web is unavailable on this platform. Save and restart manually.') }}</p><div class="cfg-dialog-actions"><button class="btn ghost" @click="restartReview = undefined">{{ tr('取消保存', 'Cancel save') }}</button><button class="btn" @click="confirmSave(false)">{{ tr('保存，稍后重启', 'Save, restart later') }}</button><button class="btn primary" :disabled="!restartReview?.restart_supported" @click="confirmSave(true)">{{ tr('保存并立即重启', 'Save and restart now') }}</button></div></DialogContent></DialogPortal></DialogRoot>
    <DialogRoot :open="!!confirmAction" @update:open="!$event && (confirmAction = undefined)"><DialogPortal v-if="pageActive"><DialogOverlay class="cfg-dialog-overlay" /><DialogContent class="cfg-dialog"><DialogTitle>{{ tr('放弃尚未保存的修改？', 'Discard unsaved changes?') }}</DialogTitle><DialogDescription>{{ confirmAction === 'reload' ? tr('重新读取会用文件中的配置替换当前草稿。', 'Reloading replaces your draft with the configuration on disk.') : tr('所有未保存的修改都会被放弃。', 'All unsaved changes will be discarded.') }}</DialogDescription><div class="cfg-dialog-actions"><button class="btn ghost" @click="confirmAction = undefined">{{ tr('继续编辑', 'Keep editing') }}</button><button class="btn danger" @click="confirm">{{ tr('放弃修改', 'Discard changes') }}</button></div><button class="cfg-dialog-close btn ghost" :aria-label="tr('关闭', 'Close')" @click="confirmAction = undefined"><X :size="18" /></button></DialogContent></DialogPortal></DialogRoot>
  </div>
</template>
