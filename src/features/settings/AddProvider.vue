<script setup lang="ts">
// Picks a model provider preset to add, or starts a custom one.
import { computed } from 'vue';
import { providerPriority } from '../../ui/catalogOrder.ts';
import type { ConfigCatalog, ProviderPreset } from '../../core/provider-presets.ts';
import { presetDescription, providerName } from '../../ui/providerPresentation.ts';
import PickerDialog from '../../ui/components/PickerDialog.vue';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ catalog?: ConfigCatalog }>();
const emit = defineEmits<{ close: []; select: [preset?: ProviderPreset] }>();
const items = computed(() => [...(props.catalog?.presets || [])]
  .sort((a, b) => providerPriority(a.provider) - providerPriority(b.provider))
  .map(preset => ({ key: preset.id, title: providerName(preset.provider), description: presetDescription(preset), search: `${preset.id} ${preset.provider} ${preset.region} ${preset.billing}`, brand: preset.provider })));
const choose = (key: string) => emit('select', props.catalog?.presets.find(preset => preset.id === key));
</script>
<template>
  <PickerDialog :title="tr('添加提供商', 'Add provider')" :items="items" :placeholder="tr('搜索提供商、地区或套餐…', 'Search providers, regions or plans…')" :page-chrome="200" @close="emit('close')" @choose="choose">
    <p v-if="!catalog" class="hint">{{ tr('预设尚未读取，可先配置自定义提供商。', 'Presets have not loaded; custom configuration is available.') }}</p>
    <template #footer-start><button type="button" class="btn ghost provider-custom" @click="emit('select')">{{ tr('自定义提供商', 'Custom provider') }}</button></template>
  </PickerDialog>
</template>
<style scoped>
.provider-custom { margin-right: auto; }
@media (max-width: 899px) { .provider-custom { width: 100%; min-height: 44px; } }
</style>
