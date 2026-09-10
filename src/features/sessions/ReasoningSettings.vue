<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef, toRef, watch } from 'vue';
import { RadioGroupRoot, RadioGroupItem } from 'reka-ui';
import { i18n } from '../../core/i18n/index.js';
import { errorText } from '../../core/config-editor';
import { readModels, readProviders, type ModelInfo } from '../../core/provider-catalog';
import { useSessionSelection } from './useSessionSelection';
import { effortLabel } from './reasoningLabels';
import Modal from '../../ui/components/Modal.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ close: [] }>();
const { snapshot, loading, saving, error, conflict, reload, save } = useSessionSelection(toRef(props, 'sessionId'));
const metadata = shallowRef<Omit<ModelInfo, 'id'>>();
const metadataError = shallowRef<unknown>();
const metadataBusy = ref(false);
const choice = ref('default'), custom = ref('');
let controller = new AbortController();
const levels = computed(() => {
  const levels = Object.keys(metadata.value?.reasoning_efforts || {});
  const defaultLevel = metadata.value?.default_reasoning_effort;
  if (defaultLevel && !levels.includes(defaultLevel)) levels.push(defaultLevel);
  const order = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  return levels.sort((a, b) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length));
});
function resetChoice() {
  const level = snapshot.value?.reasoning_effort;
  custom.value = level || '';
  choice.value = !level ? 'default' : level === 'none' ? 'none' : levels.value.includes(level) ? `preset:${level}` : 'custom';
}
async function loadMetadata() {
  controller.abort(); controller = new AbortController();
  const signal = controller.signal;
  metadata.value = undefined; metadataError.value = undefined;
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
const effort = computed(() => choice.value === 'default' ? '' : choice.value === 'none' ? 'none' : choice.value === 'custom' ? custom.value.trim() : choice.value.slice('preset:'.length));
const unsupported = computed(() => metadata.value?.supports_reasoning === false);
const changed = computed(() => snapshot.value && effort.value !== (snapshot.value.reasoning_effort || '') && (choice.value === 'default' || !!effort.value) && (!unsupported.value || ['default', 'none'].includes(choice.value)));
async function apply() {
  if (!changed.value || !snapshot.value) return;
  // Re-selecting the same pair without an effort restores the model default.
  const body = choice.value === 'default'
    ? { provider: snapshot.value.provider, model: snapshot.value.model }
    : { reasoning_effort: effort.value };
  if (await save(body)) emit('close');
}
</script>

<template>
  <Modal :open="true" :title="i18n.t('reasoning.title')" :dismissable="!saving" @close="emit('close')">
    <div v-if="error" class="load-error" role="alert">{{ conflict ? i18n.t('model.conflict') : errorText(error) }}<button class="btn ghost sm" :disabled="loading || saving" @click="reload">{{ i18n.t('common.retry') }}</button></div>
    <div v-if="metadataError" class="load-error" role="alert">{{ errorText(metadataError) }}<button class="btn ghost sm" @click="loadMetadata">{{ i18n.t('common.retry') }}</button></div>
    <p v-if="loading || metadataBusy" class="hint" role="status"><Spinner /> {{ i18n.t('reasoning.loading') }}</p>
    <p v-if="unsupported" class="hint">{{ i18n.t('reasoning.unsupported') }}</p>
    <RadioGroupRoot v-model="choice" class="effort-options" :disabled="loading || saving || metadataBusy" :aria-label="i18n.t('reasoning.title')">
      <RadioGroupItem value="default" class="effort-option"><span>{{ i18n.t('reasoning.default') }}</span><small v-if="metadata?.default_reasoning_effort">{{ effortLabel(metadata.default_reasoning_effort) }}</small></RadioGroupItem>
      <RadioGroupItem value="none" class="effort-option">{{ i18n.t('reasoning.none') }}</RadioGroupItem>
      <RadioGroupItem v-for="level in levels" :key="level" :value="`preset:${level}`" class="effort-option" :disabled="unsupported">{{ effortLabel(level) }}</RadioGroupItem>
      <RadioGroupItem value="custom" class="effort-option" :disabled="unsupported">{{ i18n.t('reasoning.custom') }}</RadioGroupItem>
    </RadioGroupRoot>
    <label v-if="choice === 'custom'" class="field effort-custom"><span>{{ i18n.t('reasoning.customLabel') }}</span><input v-model="custom" class="input" :disabled="saving || unsupported" :placeholder="i18n.t('reasoning.customPlaceholder')" /><span class="hint">{{ i18n.t('reasoning.customHint') }}</span></label>
    <p class="hint">{{ i18n.t('model.nextRunNote') }}</p>
    <template #footer><button class="btn ghost" :disabled="saving" @click="emit('close')">{{ i18n.t('manage.cancel') }}</button><button class="btn primary" :disabled="!changed || loading || saving || metadataBusy" @click="apply">{{ i18n.t('common.save') }}</button></template>
  </Modal>
</template>

<style scoped>
.effort-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.effort-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; background: transparent; text-align: left; cursor: pointer; }
.effort-option[data-state="checked"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.effort-option:disabled { opacity: .5; cursor: default; }
.effort-option small { font-size: 11px; }
.effort-custom { margin-top: 16px; }
</style>
