<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { i18n } from '../../core/i18n/index.js';
import { errorText } from '../../core/config-editor';
import { presetBrand, providerName } from '../../ui/providerPresentation';
import { useSessionSelection } from './useSessionSelection';
import { useModelCatalog } from './useModelCatalog';
import Modal from '../../ui/components/Modal.vue';
import PickerList from '../../ui/components/PickerList.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ close: [] }>();
const { snapshot, loading, saving, error, conflict, reload, save } = useSessionSelection(toRef(props, 'sessionId'));
const catalog = useModelCatalog();
const selected = ref('');
const key = (provider: string, model: string) => JSON.stringify([provider, model]);
watch(snapshot, value => { selected.value = value ? key(value.provider, value.model) : ''; });
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
    search: model.id, group: title, brand, provider: provider.id, model: model.id,
  }));
}));
const choice = computed(() => choices.value.find(item => item.key === selected.value));
const changed = computed(() => !!snapshot.value && !!choice.value && selected.value !== key(snapshot.value.provider, snapshot.value.model));
async function apply() {
  if (!changed.value || !choice.value) return;
  if (await save({ provider: choice.value.provider, model: choice.value.model })) emit('close');
}
</script>

<template>
  <Modal :open="true" :title="i18n.t('model.title')" :dismissable="!saving" @close="emit('close')">
    <div v-if="error" class="load-error" role="alert">{{ conflict ? i18n.t('model.conflict') : errorText(error) }}<button class="btn ghost sm" :disabled="loading || saving" @click="reload">{{ i18n.t('common.retry') }}</button></div>
    <div v-if="catalog.error.value" class="load-error" role="alert">{{ errorText(catalog.error.value) }}<button class="btn ghost sm" @click="catalog.reload">{{ i18n.t('common.retry') }}</button></div>
    <PickerList v-model="selected" :items="choices" :placeholder="i18n.t('model.search')" :disabled="saving || loading" />
    <p v-if="loading || catalog.pending.value" class="hint" role="status"><Spinner /> {{ i18n.t('model.loading') }}</p>
    <template v-for="group in catalog.groups.value" :key="group.provider.id">
      <div v-if="group.error" class="load-error" role="alert">{{ group.provider.id }}: {{ errorText(group.error) }}<button class="btn ghost sm" :disabled="group.loading" @click="catalog.loadGroup(group.provider.id)">{{ i18n.t('common.retry') }}</button></div>
      <p v-else-if="!group.loading && !group.models.length" class="hint">{{ group.provider.id }} · {{ i18n.t('model.noModels') }}</p>
    </template>
    <p class="hint">{{ i18n.t('model.resetEffortNote') }}</p>
    <p class="hint">{{ i18n.t('model.nextRunNote') }}</p>
    <template #footer>
      <button class="btn ghost" :disabled="saving" @click="emit('close')">{{ i18n.t('manage.cancel') }}</button>
      <button class="btn primary" :disabled="!changed || loading || saving" @click="apply">{{ i18n.t('common.save') }}</button>
    </template>
  </Modal>
</template>
