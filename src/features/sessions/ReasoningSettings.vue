<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef, toRef, watch } from 'vue';
import { i18n } from '../../core/i18n/index.js';
import { errorText } from '../../core/config-editor';
import { readModels, readProviders, type ModelInfo } from '../../core/provider-catalog';
import { useSessionSelection } from './useSessionSelection';
import { effortLabel } from './reasoningLabels';
import CommandPanel from '../../ui/components/CommandPanel.vue';
import PickerList, { type PickerItem } from '../../ui/components/PickerList.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ close: [] }>();
const { snapshot, loading, saving, error, conflict, reload, save } = useSessionSelection(toRef(props, 'sessionId'));
const metadata = shallowRef<Omit<ModelInfo, 'id'>>();
const metadataError = shallowRef<unknown>();
const metadataBusy = ref(false);
const selected = ref('default'), query = ref('');
const key = (effort?: string) => effort ? `effort:${effort}` : 'default';
let controller = new AbortController();
const levels = computed(() => {
  const levels = Object.keys(metadata.value?.reasoning_efforts || {});
  const defaultLevel = metadata.value?.default_reasoning_effort;
  if (defaultLevel && !levels.includes(defaultLevel)) levels.push(defaultLevel);
  const order = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  return levels.sort((a, b) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length));
});
function resetChoice() { selected.value = key(snapshot.value?.reasoning_effort); }
async function loadMetadata() {
  controller.abort(); controller = new AbortController();
  const signal = controller.signal;
  metadata.value = undefined; metadataError.value = undefined; metadataBusy.value = false;
  if (!snapshot.value) return;
  const { provider, model } = snapshot.value;
  metadataBusy.value = true;
  try {
    const providers = await readProviders(signal);
    const selected = providers.find(item => item.id === provider);
    if (!selected) throw new Error(i18n.t('model.providerUnavailable'));
    if (!signal.aborted) { metadata.value = selected.models[model]; resetChoice(); }
    const info = (await readModels(selected, signal)).find(item => item.id === model);
    if (!signal.aborted) { metadata.value = info; resetChoice(); }
  } catch (cause) {
    if (!signal.aborted) metadataError.value = cause;
  } finally {
    if (!signal.aborted) metadataBusy.value = false;
  }
}
watch(snapshot, () => { resetChoice(); void loadMetadata(); });
onScopeDispose(() => controller.abort());
const unsupported = computed(() => metadata.value?.supports_reasoning === false);
interface EffortItem extends PickerItem { effort: string }
const choices = computed<EffortItem[]>(() => {
  const items: EffortItem[] = [
    { key: 'default', effort: '', title: i18n.t('reasoning.default'), description: metadata.value?.default_reasoning_effort ? effortLabel(metadata.value.default_reasoning_effort) : undefined, search: 'default' },
    { key: key('none'), effort: 'none', title: i18n.t('reasoning.none'), search: 'none' },
    ...levels.value.map(effort => ({ key: key(effort), effort, title: effortLabel(effort), search: effort, disabled: unsupported.value })),
  ];
  const current = snapshot.value?.reasoning_effort;
  if (current && !items.some(item => item.effort === current)) items.push({ key: key(current), effort: current, title: current, description: i18n.t('picker.current'), disabled: unsupported.value });
  const custom = query.value.trim();
  if (custom && !unsupported.value && !items.some(item => item.effort.toLocaleLowerCase() === custom.toLocaleLowerCase())) {
    items.push({ key: key(custom), effort: custom, title: i18n.t('reasoning.useCustom', { value: custom }), description: i18n.t('reasoning.customHint'), search: custom });
  }
  return items;
});
async function apply(value: string) {
  if (loading.value || saving.value || metadataBusy.value || !snapshot.value) return;
  const current = key(snapshot.value.reasoning_effort);
  if (value === current) { emit('close'); return; }
  const choice = choices.value.find(item => item.key === value);
  if (!choice || choice.disabled) return;
  // Selecting the same model without an effort restores its default.
  const body = choice.effort === ''
    ? { provider: snapshot.value.provider, model: snapshot.value.model }
    : { reasoning_effort: choice.effort };
  if (await save(body)) emit('close');
  else selected.value = current;
}
</script>

<template>
  <CommandPanel :title="i18n.t('reasoning.title')" :busy="saving" @close="emit('close')">
    <PickerList v-model="selected" v-model:query="query" :items="choices" :icons="false" :placeholder="i18n.t('reasoning.search')" :disabled="loading || saving || metadataBusy" @select="apply">
      <template #status>
        <div v-if="error" class="command-status load-error" role="alert">{{ conflict ? i18n.t('model.conflict') : errorText(error) }}<button class="btn ghost sm" :disabled="loading || saving" @click="reload">{{ i18n.t('common.retry') }}</button></div>
        <p v-if="loading || saving || metadataBusy" class="command-status hint" role="status"><Spinner /> {{ saving ? i18n.t('picker.switching') : i18n.t('reasoning.loading') }}</p>
      </template>
      <template #after>
        <div v-if="metadataError" class="load-error" role="alert">{{ errorText(metadataError) }}<button class="btn ghost sm" @click="loadMetadata">{{ i18n.t('common.retry') }}</button></div>
        <p v-if="unsupported" class="hint">{{ i18n.t('reasoning.unsupported') }}</p>
      </template>
    </PickerList>
  </CommandPanel>
</template>
