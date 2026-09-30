<script setup lang="ts">
// One grouped render item: a text segment entry, the process thumbnail
// (consecutive reasoning/tool_call/tool_result steps) or an ask_user card. Pure dispatch.
import type { Component } from 'vue';
import { computed } from 'vue';
import ErrorEntry from './entries/ErrorEntry.vue';
import UserEntry from './entries/UserEntry.vue';
import AssistantEntry from './entries/AssistantEntry.vue';
import SystemEntry from './entries/SystemEntry.vue';
import ProcessGroup from './entries/ProcessGroup.vue';
import QuestionCard from './entries/QuestionCard.vue';
import LateAnswerEntry from './entries/LateAnswerEntry.vue';

const props = defineProps<{ item: any; forced?: boolean; session?: string }>();
const comp = computed<Component>(() =>
  props.item.type === 'process' ? ProcessGroup
  : props.item.type === 'question' ? QuestionCard
  : props.item.entry?.payload?.metadata?.source === 'ask_user_answer' ? LateAnswerEntry
  : props.item.entry?.kind === 'run_error' ? ErrorEntry
  : props.item.entry?.kind === 'user_message' ? UserEntry
  : props.item.entry?.kind === 'assistant_message' ? AssistantEntry : SystemEntry);
// What only some of them take: the process group whether it is forced open, and it and the question
// card the session they belong to.
const extra = computed(() => props.item.type === 'process' ? { forced: props.forced, session: props.session }
  : props.item.type === 'question' ? { session: props.session } : {});
</script>

<template>
  <div v-if="item.type === 'entry' && item.entry?.seq != null" class="entry-anchor" :data-seq="item.entry.seq">
    <component :is="comp" :item="item" />
  </div>
  <component :is="comp" v-else :item="item" v-bind="extra" />
</template>
