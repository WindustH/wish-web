<script setup lang="ts">
import { ref } from 'vue';
import { Plus } from '@lucide/vue';
import SelectField from '../../ui/components/SelectField.vue';
import { tr } from './fields';
defineProps<{ options: Array<{ value: string; label: string }> }>();
const emit = defineEmits<{ add: [field: string] }>();
const selected = ref('');
function add() {
  if (!selected.value) return;
  emit('add', selected.value);
  selected.value = '';
}
</script>

<template>
  <div v-if="options.length" class="cfg-add-field">
    <label>{{ tr('添加可选设置', 'Add optional setting') }}</label>
    <div class="cfg-inline">
      <SelectField v-model="selected" :options="options" :aria-label="tr('选择设置', 'Choose setting')" :placeholder="tr('选择设置', 'Choose setting')" />
      <button type="button" class="btn" :disabled="!selected" @click="add"><Plus :size="16" />{{ tr('添加', 'Add') }}</button>
    </div>
  </div>
</template>
