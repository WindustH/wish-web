<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef, toRef, watch } from 'vue';
import { i18n } from '../../core/i18n/index.js';
import { errorText } from '../../core/config-editor';
import { readModels, readProviders, type ModelInfo } from '../../core/provider-catalog';
import { useSessionSelection, type ModelSelection } from './useSessionSelection';
import { effortLabel, resolvedEffort } from './reasoningLabels';
import CommandPanel from '../../ui/components/CommandPanel.vue';
import PickerList, { type PickerItem } from '../../ui/components/PickerList.vue';
import Spinner from '../../ui/components/Spinner.vue';

const panel = ref<InstanceType<typeof CommandPanel>>();
const props = defineProps<{ sessionId?: string; selection?: ModelSelection }>();
const emit = defineEmits<{ close: []; select: [value: ModelSelection] }>();
const { snapshot, loading, saving, error, conflict, reload, save } = useSessionSelection(toRef(props, 'sessionId'), toRef(props, 'selection'), value => emit('select', value));
const metadata = shallowRef<Omit<ModelInfo, 'id'>>();
const metadataError = shallowRef<unknown>();
const metadataBusy = ref(false);
const selected = ref('default'), query = ref('');
const key = (effort?: string) => effort ? `effort:${effort}` : 'default';
let controller = new AbortController();
const providerEfforts = shallowRef<Record<string, string | number>>({});
const effortSource = ref('');
const standardLevels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const usingStandardLevels = computed(() => effortSource.value === 'generic' && !metadata.value?.reasoning_efforts);
const levels = computed(() => {
  const levels = Object.keys(metadata.value?.reasoning_efforts ?? providerEfforts.value).filter(level => level !== 'none' && level !== 'auto');
  const defaultLevel = metadata.value?.default_reasoning_effort;
  if (defaultLevel && !levels.includes(defaultLevel)) levels.push(defaultLevel);
  const order = ['off', ...standardLevels];
  return levels.sort((a, b) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length));
});
function resetChoice() { selected.value = key(resolvedEffort(snapshot.value?.reasoning_effort, metadata.value, providerEfforts.value)); }
async function loadMetadata() {
  controller.abort(); controller = new AbortController();
  const signal = controller.signal;
  metadata.value = undefined; providerEfforts.value = {}; effortSource.value = ''; metadataError.value = undefined; metadataBusy.value = false;
  if (!snapshot.value) return;
  const { provider, model } = snapshot.value;
  metadataBusy.value = true;
  try {
    const providers = await readProviders(signal);
    const selected = providers.find(item => item.id === provider);
    if (!selected) throw new Error(i18n.t('model.providerUnavailable'));
    if (!signal.aborted) { metadata.value = selected.models[model]; providerEfforts.value = selected.reasoning_efforts; effortSource.value = selected.reasoning_efforts_source; resetChoice(); }
    const info = (await readModels(selected, signal)).find(item => item.id === model);
    if (!signal.aborted) { metadata.value = info; resetChoice(); }
  } catch (cause) {
    if (!signal.aborted) metadataError.value = cause;
  } finally {
    if (!signal.aborted) metadataBusy.value = false;
  }
}
watch(snapshot, () => { resetChoice(); void loadMetadata(); }, { immediate: true });
onScopeDispose(() => controller.abort());
const unsupported = computed(() => metadata.value?.supports_reasoning === false);
interface EffortItem extends PickerItem { effort: string }
const choices = computed<EffortItem[]>(() => {
  const items: EffortItem[] = [
    { key: key('none'), effort: 'none', title: 'none', description: i18n.t('reasoning.none'), search: 'none' },
    ...levels.value.map(effort => ({ key: key(effort), effort, title: effortLabel(effort), search: effort, disabled: unsupported.value })),
  ];
  const current = snapshot.value?.reasoning_effort;
  if (current && !items.some(item => item.effort === current)) items.push({ key: key(current), effort: current, title: current, description: i18n.t('picker.current'), disabled: unsupported.value });
  const custom = query.value.trim();
  if (custom && custom.toLowerCase() !== 'auto' && !unsupported.value && !items.some(item => item.effort.toLocaleLowerCase() === custom.toLocaleLowerCase())) {
    items.push({ key: key(custom), effort: custom, title: i18n.t('reasoning.useCustom', { value: custom }), description: i18n.t('reasoning.customHint'), search: custom });
  }
  return items;
});
async function apply(value: string) {
  if (loading.value || saving.value || metadataBusy.value || !snapshot.value) return;
  const current = key(snapshot.value.reasoning_effort);
  if (value === current) { panel.value?.close(); return; }
  const choice = choices.value.find(item => item.key === value);
  if (!choice || choice.disabled) return;
  const body = { reasoning_effort: choice.effort };
  if (await save(body)) panel.value?.close();
  else selected.value = current;
}
</script>

<template>
  <CommandPanel ref="panel" :title="i18n.t('reasoning.title')" :busy="saving" @close="emit('close')">
    <PickerList v-model="selected" v-model:query="query" :items="choices" :icons="false" :placeholder="i18n.t('reasoning.search')" :disabled="loading || saving || metadataBusy" @select="apply">
      <template #status>
        <div v-if="error" class="command-status load-error" role="alert">{{ conflict ? i18n.t('model.conflict') : errorText(error) }}<button class="btn ghost sm" :disabled="loading || saving" @click="reload">{{ i18n.t('common.retry') }}</button></div>
        <p v-if="loading || saving || metadataBusy" class="command-status hint" role="status"><Spinner /> {{ saving ? i18n.t('picker.switching') : i18n.t('reasoning.loading') }}</p>
      </template>
      <template #after>
        <div v-if="metadataError" class="load-error" role="alert">{{ errorText(metadataError) }}<button class="btn ghost sm" @click="loadMetadata">{{ i18n.t('common.retry') }}</button></div>
        <p v-if="unsupported" class="hint">{{ i18n.t('reasoning.unsupported') }}</p>
        <p v-else-if="usingStandardLevels && !metadataBusy" class="hint">{{ i18n.t('reasoning.standardHint') }}</p>
      </template>
    </PickerList>
  </CommandPanel>
</template>
