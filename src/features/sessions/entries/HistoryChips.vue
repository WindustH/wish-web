<script setup lang="ts">
// The buttons a reply's words carry - runs of steps and notices - in the order they came.
import type { ChipItem } from '../grouping.ts';
import ProcessGroup from './ProcessGroup.vue';
import SystemEntry from './SystemEntry.vue';

defineProps<{ chips: ChipItem<any>[]; session?: string; forcedKeys?: ReadonlySet<string> }>();
</script>

<template>
  <span class="history-chips">
    <template v-for="chip in chips" :key="chip.key">
      <ProcessGroup v-if="chip.type === 'process'" :item="chip" :session="session" :forced="forcedKeys?.has(chip.key)" />
      <SystemEntry v-else :item="chip" :forced="forcedKeys?.has(chip.key)" />
    </template>
  </span>
</template>
