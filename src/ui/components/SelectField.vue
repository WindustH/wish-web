<script setup lang="ts">
import ProviderIcon from './ProviderIcon.vue';
import { computed, ref, watch } from 'vue';
import { SelectRoot, SelectTrigger, SelectValue, SelectIcon, SelectPortal, SelectContent, SelectViewport, SelectItem, SelectItemText, SelectItemIndicator } from 'reka-ui';
import { Check, ChevronDown } from '@lucide/vue';
import { usePageActivity } from '../composables/usePageActivity';

defineOptions({ inheritAttrs: false });
export interface SelectOption { value: string; label: string; brand?: string; disabled?: boolean }
const props = defineProps<{ modelValue: string; options: SelectOption[]; placeholder?: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const pageActive = usePageActivity();
const open = ref(false);
const unavailable = computed(() => props.disabled || !props.options.some(option => !option.disabled));
watch(unavailable, value => { if (value) open.value = false; });
const selected = computed(() => props.options.find(option => option.value === props.modelValue));
watch(pageActive, active => { if (!active) open.value = false; });
</script>

<template>
  <SelectRoot v-model:open="open" :model-value="selected" by="value" :disabled="unavailable" @update:model-value="option => emit('update:modelValue', (option as SelectOption).value)">
    <SelectTrigger v-bind="$attrs" class="control-select">
      <SelectValue :placeholder="placeholder"><span class="select-option-label"><ProviderIcon v-if="selected?.brand" :brand="selected.brand" /><span>{{ selected?.label || placeholder }}</span></span></SelectValue>
      <SelectIcon as-child><ChevronDown :size="16" aria-hidden="true" /></SelectIcon>
    </SelectTrigger>
    <SelectPortal v-if="pageActive">
      <SelectContent class="control-select-popover" position="popper" :side-offset="5" :collision-padding="12">
        <SelectViewport class="control-select-list">
          <SelectItem v-for="option in options" :key="option.value" :value="option" :disabled="option.disabled" :text-value="option.label" :data-value="option.value" class="control-select-option">
            <span class="select-option-label"><ProviderIcon v-if="option.brand" :brand="option.brand" /><SelectItemText>{{ option.label }}</SelectItemText></span>
            <SelectItemIndicator><Check :size="15" aria-hidden="true" /></SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.select-option-label { display: flex; align-items: center; gap: 9px; min-width: 0; }
.select-option-label > span:last-child { overflow: hidden; text-overflow: ellipsis; }
</style>
