<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ConfigCatalog, ProviderPreset } from '../../core/config-editor';
import { presetDescription, providerName } from '../../ui/providerPresentation';
import Modal from '../../ui/components/Modal.vue';
import PickerList from '../../ui/components/PickerList.vue';
import { tr } from './fields';

const props = defineProps<{ catalog?: ConfigCatalog }>();
const emit = defineEmits<{ close: []; select: [preset?: ProviderPreset] }>();
const selected = ref('custom');
const items = computed(() => [
  { key: 'custom', title: tr('配置自定义供应商', 'Configure a custom provider'), description: tr('使用自己的服务地址和协议', 'Use your own endpoint and protocol'), alwaysVisible: true },
  ...(props.catalog?.presets || []).map(preset => ({ key: preset.id, title: providerName(preset.provider), description: presetDescription(preset), search: `${preset.id} ${preset.provider} ${preset.region} ${preset.billing}`, brand: preset.provider })),
]);
function add() { emit('select', selected.value === 'custom' ? undefined : props.catalog!.presets.find(preset => preset.id === selected.value)!); }
</script>

<template>
  <Modal :open="true" :title="tr('添加供应商', 'Add provider')" @close="emit('close')">
    <PickerList v-model="selected" :items="items" :placeholder="tr('搜索供应商、地区或套餐…', 'Search providers, regions or plans…')" />
    <p v-if="!catalog" class="hint">{{ tr('预设尚未读取，可先配置自定义供应商。', 'Presets have not loaded; custom configuration is available.') }}</p>
    <template #footer><button class="btn ghost" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button><button class="btn primary" @click="add">{{ tr('添加', 'Add') }}</button></template>
  </Modal>
</template>
