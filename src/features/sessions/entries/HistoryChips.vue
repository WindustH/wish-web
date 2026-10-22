<script setup lang="ts">
// The ordered steps and notices to the left of an assistant reply (or on their own rail).
import type { ChipItem } from '../grouping.ts';
import { tr } from '../../../core/i18n/tr.ts';
import ProcessGroup from './ProcessGroup.vue';
import SystemEntry from './SystemEntry.vue';

defineProps<{ chips: ChipItem<any>[]; session?: string; forcedKeys?: ReadonlySet<string> }>();
</script>

<template>
  <span class="history-rail" role="group" :aria-label="tr('活动', 'Activity')">
    <template v-for="chip in chips" :key="chip.key">
      <ProcessGroup v-if="chip.type === 'process'" rail :item="chip" :session="session" :forced="forcedKeys?.has(chip.key)" />
      <SystemEntry v-else rail :item="chip" :forced="forcedKeys?.has(chip.key)" />
    </template>
  </span>
</template>
