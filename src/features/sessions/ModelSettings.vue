<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { Image } from '@lucide/vue';
import { i18n } from '../../core/i18n/index.js';
import { errorText } from '../../core/config-editor';
import { presetBrand, providerName } from '../../ui/providerPresentation';
import { useSessionSelection, type ModelSelection } from './useSessionSelection';
import { useModelCatalog } from './useModelCatalog';
import CommandPanel from '../../ui/components/CommandPanel.vue';
import PickerList from '../../ui/components/PickerList.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ sessionId?: string; selection?: ModelSelection }>();
const emit = defineEmits<{ close: []; select: [value: ModelSelection] }>();
const { snapshot, loading, saving, error, conflict, reload, save } = useSessionSelection(toRef(props, 'sessionId'), toRef(props, 'selection'), value => emit('select', value));
const catalog = useModelCatalog();
const selected = ref('');
const key = (provider: string, model: string) => JSON.stringify([provider, model]);
watch(snapshot, value => { selected.value = value ? key(value.provider, value.model) : ''; }, { immediate: true });
const choices = computed(() => catalog.groups.value.flatMap(group => {
  const { provider } = group;
  const brand = presetBrand(provider.preset);
  const title = brand ? `${providerName(brand)} · ${provider.id}` : provider.id;
  const models = [...group.models];
  if (snapshot.value?.provider === provider.id && !models.some(model => model.id === snapshot.value!.model)) {
    models.unshift({ id: snapshot.value.model, source: 'current' });
  }
  return models.map(model => ({
    key: key(provider.id, model.id), title: model.display_name || model.id,
    description: model.display_name ? model.id : model.source === 'current' ? i18n.t('model.currentSuffix') : model.description,
    vision: model.input_modalities?.includes('image') === true,
    search: model.id, group: title, brand, provider: provider.id, model: model.id,
  }));
}));
const visionChoices = computed(() => new Set(choices.value.filter(choice => choice.vision).map(choice => choice.key)));
async function apply(value: string) {
  if (loading.value || saving.value || !snapshot.value) return;
  const current = key(snapshot.value.provider, snapshot.value.model);
  if (value === current) { emit('close'); return; }
  const choice = choices.value.find(item => item.key === value);
  if (!choice) return;
  if (await save({ provider: choice.provider, model: choice.model })) emit('close');
  else selected.value = current;
}
</script>

<template>
  <CommandPanel :title="i18n.t('model.title')" :busy="saving" @close="emit('close')">
    <PickerList v-model="selected" :items="choices" :placeholder="i18n.t('model.search')" :disabled="saving || loading" @select="apply">
      <template #suffix="{ itemKey }"><span v-if="visionChoices.has(itemKey)" class="model-vision" :title="i18n.t('model.visionHint')"><Image :size="13" aria-hidden="true" />{{ i18n.t('model.vision') }}</span></template>
      <template #status>
        <div v-if="error" class="command-status load-error" role="alert">{{ conflict ? i18n.t('model.conflict') : errorText(error) }}<button class="btn ghost sm" :disabled="loading || saving" @click="reload">{{ i18n.t('common.retry') }}</button></div>
        <div v-if="catalog.error.value" class="command-status load-error" role="alert">{{ errorText(catalog.error.value) }}<button class="btn ghost sm" @click="catalog.reload">{{ i18n.t('common.retry') }}</button></div>
        <p v-if="loading || saving || catalog.pending.value" class="command-status hint" role="status"><Spinner /> {{ saving ? i18n.t('picker.switching') : i18n.t('model.loading') }}</p>
      </template>
      <template #after>
        <template v-for="group in catalog.groups.value" :key="group.provider.id">
          <div v-if="group.error" class="load-error" role="alert">{{ group.provider.id }}: {{ errorText(group.error) }}<button class="btn ghost sm" :disabled="group.loading" @click="catalog.loadGroup(group.provider.id)">{{ i18n.t('common.retry') }}</button></div>
          <p v-else-if="!group.loading && !group.models.length" class="hint">{{ group.provider.id }} · {{ i18n.t('model.noModels') }}</p>
        </template>
      </template>
    </PickerList>
  </CommandPanel>
</template>

<style scoped>
.model-vision { display: inline-flex; align-items: center; gap: 4px; flex: none; color: var(--fg-subtle); font-size: 11px; white-space: nowrap; }
</style>
