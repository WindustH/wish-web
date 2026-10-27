<script setup lang="ts">
import { computed } from 'vue';
import SelectField from '../../ui/components/SelectField.vue';
import { tr } from '../../core/i18n/tr.ts';
defineProps<{ disabled?: boolean; note?: string }>();
const mode = defineModel<'Serial' | 'Parallel'>({ required: true });
const options = computed(() => [
  { value: 'Parallel', label: tr('并行', 'Parallel') },
  { value: 'Serial', label: tr('串行', 'Sequential') },
]);
function select(value: string) {
  if (value === 'Parallel' || value === 'Serial') mode.value = value;
}
</script>
<template>
  <div class="set-row inline tool-execution-row">
    <span class="set-label"
      ><span>{{ tr('工具执行方式', 'Tool execution') }}</span
      ><small>{{
        note ||
        tr(
          '同一轮的多个工具调用：并行同时启动，串行依次执行。',
          'Multiple tool calls in one turn: start together or execute in order.',
        )
      }}</small></span
    >
    <SelectField
      segmented
      :model-value="mode"
      :options="options"
      :disabled="disabled"
      :aria-label="tr('工具执行方式', 'Tool execution')"
      @update:model-value="select"
    />
  </div>
</template>

<style scoped>
.set-row.tool-execution-row {
  grid-template-columns: minmax(0, 1fr) auto;
}
.tool-execution-row > :deep(.choice-capsule) {
  justify-self: end;
}
</style>
