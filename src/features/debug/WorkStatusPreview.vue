<script setup lang="ts">
import { computed, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import SelectField from '../../ui/components/SelectField.vue';
import WorkStatus from '../sessions/WorkStatus.vue';
import type { WorkGlyphKind } from '../sessions/workActivity.ts';
import { workStatusExamples } from './workStatusExamples.ts';

const selected = ref('working');
const examples = computed(workStatusExamples);
const options = computed(() =>
  Object.entries(examples.value).map(([value, activity]) => ({ value, label: activity.label })),
);
</script>
<template>
  <div class="work-preview">
    <SelectField v-model="selected" :options="options" :aria-label="tr('预览状态', 'Preview state')" />
    <WorkStatus :activity="examples[selected as WorkGlyphKind]" />
  </div>
</template>
<style scoped>
.work-preview {
  display: grid;
  gap: 14px;
}
.work-preview > :deep(.control-select) {
  width: min(100%, 22rem);
}
</style>
