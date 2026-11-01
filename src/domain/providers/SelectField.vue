<script setup lang="ts">
import SelectField from '../../ui/components/SelectField.vue';
import Icon from '../../ui/components/Icon.vue';
import ProviderIcon from './ProviderIcon.vue';
import type { SelectOption } from './types.ts';
const props = defineProps<{
  mobilePage?: boolean;
  placeholder?: string;
  pickerTitle?: string;
  modelValue: string;
  options: SelectOption[];
  disabled?: boolean;
  searchable?: boolean;
  segmented?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const brand = (value?: string) => props.options.find((option) => option.value === value)?.brand;
</script>
<template>
  <SelectField v-bind="props" @update:model-value="emit('update:modelValue', $event)">
    <template #icon="{ option }">
      <ProviderIcon v-if="brand(option?.value)" :brand="brand(option?.value)!" />
      <Icon v-else-if="option?.icon" :name="option.icon" :size="18" />
    </template>
  </SelectField>
</template>
