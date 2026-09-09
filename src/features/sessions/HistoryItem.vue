<script setup lang="ts">
// One grouped render item: a text segment entry, or the process thumbnail
// (consecutive reasoning/tool_call/tool_result steps). Pure dispatch.
import type { Component } from 'vue';
import { computed } from 'vue';
import UserEntry from './entries/UserEntry.vue';
import AssistantEntry from './entries/AssistantEntry.vue';
import ProcessGroup from './entries/ProcessGroup.vue';

const props = defineProps<{ item: any }>();
const comp = computed<Component>(() =>
  props.item.type === 'process' ? ProcessGroup
  : props.item.entry?.kind === 'user_message' ? UserEntry
  : AssistantEntry);
</script>

<template>
  <div v-if="item.type === 'entry' && item.entry?.seq != null" class="entry-anchor" :data-seq="item.entry.seq">
    <component :is="comp" :item="item" />
  </div>
  <component :is="comp" v-else :item="item" />
</template>
