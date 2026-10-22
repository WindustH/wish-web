<script setup lang="ts">
// One grouped render item: a text segment entry (with the steps and notices beside it as
// buttons), a row of such buttons with no text to sit beside, or an ask_user card. Pure dispatch.
import type { Component } from 'vue';
import { computed } from 'vue';
import ErrorEntry from './entries/ErrorEntry.vue';
import UserEntry from './entries/UserEntry.vue';
import AssistantEntry from './entries/AssistantEntry.vue';
import SystemEntry from './entries/SystemEntry.vue';
import ProcessGroup from './entries/ProcessGroup.vue';
import HistoryChips from './entries/HistoryChips.vue';
import QuestionCard from './entries/QuestionCard.vue';
import LateAnswerEntry from './entries/LateAnswerEntry.vue';
import GroupSentEntry from './entries/GroupSentEntry.vue';
import GroupMessageEntry from './entries/GroupMessageEntry.vue';

// `forcedKeys` are the groups a search holds open to show what it found.
const props = defineProps<{ item: any; forcedKeys?: ReadonlySet<string>; session?: string }>();
const comp = computed<Component>(() =>
  props.item.type === 'process' ? ProcessGroup
  : props.item.type === 'chips' ? HistoryChips
  : props.item.type === 'question' ? QuestionCard
  : props.item.entry?.payload?.metadata?.source === 'ask_user_answer' ? LateAnswerEntry
  : props.item.entry?.kind === 'group_sent' ? GroupSentEntry
  : props.item.entry?.kind === 'group_message' ? GroupMessageEntry
  : props.item.entry?.kind === 'run_error' ? ErrorEntry
  : props.item.entry?.kind === 'user_message' ? UserEntry
  : props.item.entry?.kind === 'assistant_message' ? AssistantEntry : SystemEntry);
// What only some of them take: the buttons and the replies that carry them which are held open, and
// the session they belong to.
const bound = computed(() => props.item.type === 'chips' ? { chips: props.item.chips, forcedKeys: props.forcedKeys, session: props.session }
  : props.item.type === 'process' ? { item: props.item, forced: props.forcedKeys?.has(props.item.key), session: props.session }
  : props.item.type === 'question' ? { item: props.item, session: props.session }
  : props.item.entry?.kind === 'assistant_message' ? { item: props.item, forcedKeys: props.forcedKeys, session: props.session } : { item: props.item });
</script>

<template>
  <div v-if="item.type === 'entry' && item.entry?.seq != null" class="entry-anchor" :data-seq="item.entry.seq">
    <component :is="comp" v-bind="bound" />
  </div>
  <div v-else-if="item.type === 'chips'" class="history-chip-row"><component :is="comp" v-bind="bound" /></div>
  <component :is="comp" v-else v-bind="bound" />
</template>
