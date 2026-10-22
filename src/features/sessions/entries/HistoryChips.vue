<script setup lang="ts">
// The hosts of the windows a reply's activity opens, seen nowhere: the rail that floats beside
// the log owns every node now, and asks for a chip (and the step of it) to open through the
// request ChatLog hands down. Each chip stays a ProcessGroup or SystemEntry in ghost form - the
// very components that always opened these windows, keeping their state and search behaviour.
import { computed, inject, ref, watch } from 'vue';
import type { ChipItem } from '../grouping.ts';
import { railOpenKey } from '../railState.ts';
import ProcessGroup from './ProcessGroup.vue';
import SystemEntry from './SystemEntry.vue';

const props = defineProps<{ chips: ChipItem<any>[]; session?: string; forcedKeys?: ReadonlySet<string> }>();
// A step preset for a run, a plain open for a notice - the same ticks the rail's list trips.
const stepPicks = ref<Record<string, { key: string; tick: number }>>({});
const noticeTicks = ref<Record<string, number>>({});
const openRequest = inject(railOpenKey, null);
watch(() => openRequest?.value, request => {
  if (!request) return;
  const chip = props.chips.find(entry => entry.key === request.chipKey);
  if (!chip) return;
  if (chip.type === 'process' && request.stepKey)
    stepPicks.value = { ...stepPicks.value, [chip.key]: { key: request.stepKey, tick: (stepPicks.value[chip.key]?.tick ?? 0) + 1 } };
  else
    noticeTicks.value = { ...noticeTicks.value, [chip.key]: (noticeTicks.value[chip.key] ?? 0) + 1 };
}, { deep: false });
const hosted = computed(() => props.chips);
</script>

<template>
  <span class="history-rail-host">
    <ProcessGroup v-for="chip in hosted.filter(entry => entry.type === 'process')" :key="chip.key" variant="ghost" :item="chip" :session="session"
      :forced="forcedKeys?.has(chip.key)" :open-step="stepPicks[chip.key]" />
    <SystemEntry v-for="chip in hosted.filter(entry => entry.type !== 'process')" :key="chip.key" variant="ghost" :item="chip"
      :forced="forcedKeys?.has(chip.key)" :open-tick="noticeTicks[chip.key]" />
  </span>
</template>
