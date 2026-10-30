<script setup lang="ts">
// Virtual rows render message content and question cards. Activity windows live in ActivityDialogs.
import type { TranscriptRow } from '../../domain/chat/transcript.ts';
import type { EntryView } from '../../core/api/projections.ts';
import type { Component } from 'vue';
import { computed } from 'vue';
import FileChangeCards from './entries/FileChangeCards.vue';
import ErrorEntry from './entries/ErrorEntry.vue';
import UserEntry from '../../domain/chat/entries/UserEntry.vue';
import AssistantEntry from './entries/AssistantEntry.vue';
import SystemEntry from './entries/SystemEntry.vue';
import QuestionCard from './entries/QuestionCard.vue';
import LateAnswerEntry from './entries/LateAnswerEntry.vue';
import GroupSentEntry from './entries/GroupSentEntry.vue';
import GroupMessageEntry from './entries/GroupMessageEntry.vue';
import ImageAlbumEntry from './entries/ImageAlbumEntry.vue';

// `forcedKeys` are the groups a search holds open to show what it found.
const props = defineProps<{
  item: TranscriptRow<EntryView>;
  forcedKeys?: ReadonlySet<string>;
  session?: string;
  locateSeq?: number;
}>();
const entry = computed(() => ('entry' in props.item ? props.item.entry : null));
const entryComponent = computed<Component>(() =>
  props.item.type === 'image_album'
    ? ImageAlbumEntry
    : props.item.type === 'question'
      ? QuestionCard
      : entry.value?.payload?.metadata?.source === 'ask_user_answer'
        ? LateAnswerEntry
        : entry.value?.kind === 'group_sent'
          ? GroupSentEntry
          : entry.value?.kind === 'group_message'
            ? GroupMessageEntry
            : entry.value?.kind === 'run_error'
              ? ErrorEntry
              : entry.value?.kind === 'user_message'
                ? UserEntry
                : entry.value?.kind === 'assistant_message'
                  ? AssistantEntry
                  : SystemEntry,
);
// What only some of them take: the buttons and the replies that carry them which are held open, and
// the session they belong to.
const entryProps = computed(() =>
  props.item.type === 'question'
    ? { item: props.item, session: props.session }
    : props.item.type === 'image_album'
      ? { item: props.item, forcedKeys: props.forcedKeys, session: props.session, locateSeq: props.locateSeq }
      : entry.value?.kind === 'assistant_message'
        ? { item: props.item, forcedKeys: props.forcedKeys, session: props.session, locateSeq: props.locateSeq }
        : { item: props.item, ...(entry.value?.kind === 'run_error' ? { session: props.session } : {}) },
);
</script>

<template>
  <FileChangeCards :item="item" />
  <div v-if="item.type === 'entry' && item.entry?.seq != null" class="entry-anchor" :data-seq="item.entry.seq">
    <component :is="entryComponent" v-bind="entryProps" />
  </div>
  <div v-else-if="item.type === 'chips' || item.type === 'process'" class="history-chip-row" />
  <component :is="entryComponent" v-else v-bind="entryProps" />
</template>
