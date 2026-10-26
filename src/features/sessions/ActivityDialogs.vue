<script setup lang="ts">
// One stable host per session. Only requested or search-selected activities mount a dialog.
// Closing removes the host; moving a chip between virtual rows never changes its identity.
import { computed, ref, watch } from 'vue';
import type { EntryView } from '../../core/api/projections.ts';
import type { ChipItem } from './grouping.ts';
import type { ActivityRequest } from './activityDialogs.ts';
import ProcessGroup from './entries/ProcessGroup.vue';
import SystemEntry from './entries/SystemEntry.vue';

const props = defineProps<{ chips: ChipItem<EntryView>[]; request: ActivityRequest | null;
  session: string; forcedKeys?: ReadonlySet<string>; locateSeq?: number }>();
const emit = defineEmits<{ dismiss: [requestId: number] }>();
const selected = ref<ActivityRequest | null>(null);
const searchSelections = ref(new Set<string>());
watch(() => props.request, request => { selected.value = request; searchSelections.value = new Set(); }, { immediate: true });
watch(() => [...(props.forcedKeys ?? [])], keys => {
  if (keys.length) { selected.value = null; searchSelections.value = new Set(keys); }
}, { immediate: true });
const activeChips = computed(() => props.chips.filter(chip => chip.key === selected.value?.chipKey
  || searchSelections.value.has(chip.key)));
function closeActivity(key: string) {
  if (selected.value?.chipKey === key) {
    emit('dismiss', selected.value.requestId);
    selected.value = null;
  }
  searchSelections.value = new Set([...searchSelections.value].filter(value => value !== key));
}
// A disappearing activity cancels the open intent. Streaming reconciliation may restore it,
// but that is data arriving, not a new request to open a window.
watch(() => props.chips, chips => {
  if (selected.value && !chips.some(chip => chip.key === selected.value!.chipKey)) closeActivity(selected.value.chipKey);
});
const requestedStep = computed(() => {
  const request = selected.value;
  return request?.stepKey
    ? { key: request.stepKey, tick: request.requestId, solo: request.solo } : undefined;
});
</script>

<template>
  <div class="activity-dialog-host">
    <template v-for="chip in activeChips" :key="chip.key">
      <ProcessGroup v-if="chip.type === 'process'" variant="ghost" :item="chip" :session="session"
        :forced="searchSelections.has(chip.key)" :open-step="selected?.chipKey === chip.key ? requestedStep : undefined"
        :open-tick="selected?.chipKey === chip.key && !selected.stepKey ? selected.requestId : undefined"
        :target-seq="locateSeq" @close="closeActivity(chip.key)" />
      <SystemEntry v-else variant="ghost" :item="chip" :forced="searchSelections.has(chip.key)"
        :open-tick="selected?.chipKey === chip.key ? selected.requestId : undefined" @close="closeActivity(chip.key)" />
    </template>
  </div>
</template>
<style scoped>
.activity-dialog-host { display: contents; }
</style>
