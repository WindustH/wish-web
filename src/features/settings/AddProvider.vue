<script setup lang="ts">
import { useMedia } from '../../ui/composables/useMedia';
const isMobile=useMedia('(max-width: 899px)');
import { providerPriority } from '../../ui/catalogOrder';
import { computed, ref } from 'vue';
import type { ConfigCatalog, ProviderPreset } from '../../core/provider-presets';
import { presetDescription, providerName } from '../../ui/providerPresentation';
import Modal from '../../ui/components/Modal.vue';
import PickerList from '../../ui/components/PickerList.vue';
import { tr } from './fields';

const props = defineProps<{ catalog?: ConfigCatalog }>();
const emit = defineEmits<{ close: []; select: [preset?: ProviderPreset] }>();
const selected = ref('');
const items = computed(() => [
  ...[...(props.catalog?.presets || [])].sort((a, b) => providerPriority(a.provider) - providerPriority(b.provider)).map(preset => ({ key: preset.id, title: providerName(preset.provider), description: presetDescription(preset), search: `${preset.id} ${preset.provider} ${preset.region} ${preset.billing}`, brand: preset.provider })),
]);
function add() { if (selected.value) emit('select', props.catalog!.presets.find(preset => preset.id === selected.value)!); }
</script>

<template>
  <Modal :page="isMobile" :open="true" compact :title="tr('添加提供商', 'Add provider')" @close="emit('close')">
    <PickerList @select="key=>{if(isMobile)emit('select',catalog?.presets.find(p=>p.id===key));}" v-model="selected" :items="items" :placeholder="tr('搜索提供商、地区或套餐…', 'Search providers, regions or plans…')" />
    <p v-if="!catalog" class="hint">{{ tr('预设尚未读取，可先配置自定义提供商。', 'Presets have not loaded; custom configuration is available.') }}</p>
    <template #footer><div class="provider-picker-actions"><button type="button" class="btn ghost provider-custom" @click="emit('select')">{{ tr('自定义提供商', 'Custom provider') }}</button><button v-if="!isMobile" class="btn ghost" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button><button v-if="!isMobile" class="btn primary" :disabled="!selected" @click="add">{{ tr('添加', 'Add') }}</button></div></template>
  </Modal>
</template>

<style scoped>
.provider-picker-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; }
.provider-custom { margin-right: auto; }
@media(max-width:899px){:deep(.picker-viewport){height:calc(100dvh - 200px)!important}.provider-custom{width:100%;min-height:44px}}
</style>
