<script setup lang="ts">
import Icon from '../../ui/components/Icon.vue';
import { modelLabel } from '../../ui/modelLabel.ts';
import Hint from '../../ui/components/Hint.vue';
import { computed, ref, toRef, watch } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { errorText } from '../../core/errors.ts';
import { presetBrand } from '../../ui/providerPresentation.ts';
import { useProviderTitles } from '../../ui/composables/useProviderTitles.ts';
import { useSessionSelection, type ModelSelection } from './useSessionSelection.ts';
import { useModelCatalog } from '../../ui/composables/useModelCatalog.ts';
import CommandPanel from '../../ui/components/CommandPanel.vue';
import PickerList from '../../ui/components/PickerList.vue';
import { tr } from '../../core/i18n/tr.ts';
import SelectionStatus from './SelectionStatus.vue';

const panel = ref<InstanceType<typeof CommandPanel>>();
const props = defineProps<{ sessionId?: string; selection?: ModelSelection }>();
const emit = defineEmits<{ close: []; select: [value: ModelSelection] }>();
const { snapshot, loading, saving, error, conflict, reload, save } = useSessionSelection(toRef(props, 'sessionId'), toRef(props, 'selection'), value => emit('select', value));
const catalog = useModelCatalog();
const providerTitle = useProviderTitles();
const selected = ref('');
const key = (provider: string, model: string) => JSON.stringify([provider, model]);
watch(snapshot, value => { selected.value = value ? key(value.provider, value.model) : ''; }, { immediate: true });
const choices = computed(() => catalog.groups.value.flatMap(group => {
  const { provider } = group;
  const brand = presetBrand(provider.preset);
  const title = providerTitle(provider.id);
  const models = [...group.models];
  if (snapshot.value?.provider === provider.id && !models.some(model => model.id === snapshot.value!.model)) {
    models.unshift({ id: snapshot.value.model, source: 'current' });
  }
  return models.map(model => ({
    key: key(provider.id, model.id), title: modelLabel(model.id),
    vision: model.input_modalities?.includes('image') === true,
    search: model.id, description: model.source === 'current' ? (tr('目录中未找到', 'Not found in catalog')) : undefined,
    disabled: model.source === 'current', group: title, brand, provider: provider.id, model: model.id,
  }));
}));
const visionChoices = computed(() => new Set(choices.value.filter(choice => choice.vision).map(choice => choice.key)));
async function apply(value: string) {
  if (loading.value || saving.value || !snapshot.value) return;
  const current = key(snapshot.value.provider, snapshot.value.model);
  if (value === current) { panel.value?.close(); return; }
  const choice = choices.value.find(item => item.key === value);
  if (!choice) return;
  if (await save({ provider: choice.provider, model: choice.model })) panel.value?.close();
  else selected.value = current;
}
</script>

<template>
  <CommandPanel ref="panel" :title="i18n.t('model.title')" :busy="saving" @close="emit('close')">
    <PickerList v-model="selected" :items="choices" :placeholder="i18n.t('model.search')" :disabled="saving || loading" @select="apply">
      <template #suffix="{ itemKey }"><Hint :text="i18n.t('model.visionHint')" v-if="visionChoices.has(itemKey)"><span class="model-vision" :aria-label="i18n.t('model.vision')"><Icon name="image" :size="13" aria-hidden="true" /></span></Hint></template>
      <template #status>
        <SelectionStatus :running="snapshot?.running" :error="error" :conflict="conflict" :loading="loading" :saving="saving" :busy="loading || saving || catalog.pending.value" :loading-text="i18n.t('model.loading')" @retry="reload">
          <div v-if="catalog.error.value" class="command-status load-error" role="alert">{{ errorText(catalog.error.value) }}<button class="btn ghost sm" @click="catalog.reload">{{ i18n.t('common.retry') }}</button></div>
        </SelectionStatus>
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
