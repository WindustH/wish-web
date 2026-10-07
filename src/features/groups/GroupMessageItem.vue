<script setup lang="ts">
// One message of a group's transcript: the user's on the right like a chat's, a session's on the
// left under its name and mark in a colour of its own - the name leads to its session. A message
// right after one of the same author's goes without the name.
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { GroupMessage } from '../../core/api/types.ts';
import { groupBlob } from '../../core/api/endpoints.ts';
import type { ContentBlock } from '../../core/api/userContent.ts';
import Markdown from '../../ui/components/Markdown.vue';
import MessageContext from '../sessions/entries/MessageContext.vue';
import UserEntry from '../sessions/entries/UserEntry.vue';
import { peerColor } from './peerColor.ts';

const props = defineProps<{ message: GroupMessage; groupId: string; continues: boolean }>();
const author = computed(() => props.message.author);
const name = computed(() => author.value.kind === 'session' ? author.value.name || author.value.id.slice(0, 8) : '');
const color = computed(() => author.value.kind === 'session' ? peerColor(author.value.id) : 'var(--fg-muted)');
// The user's post as a chat shows the user's messages: the images and files, then the words.
const content = computed<ContentBlock[]>(() => [
  ...(props.message.attachments ?? []).map(file => ({ type: file.kind, blob_id: groupBlob(props.groupId, file.id), filename: file.name })),
  ...(props.message.text ? [{ type: 'text' as const, text: props.message.text }] : []),
]);
</script>

<template>
  <UserEntry v-if="author.kind === 'user'" :content="content" />
  <MessageContext v-else :text="message.text" kind="assistant">
    <div class="entry assistant group-peer" :class="{ continues }" :style="{ '--peer-color': color }">
      <div v-if="!continues && author.kind === 'session'" class="group-peer-head">
        <RouterLink class="group-peer-author" :to="`/s/${author.id}`">
          <span class="group-peer-mark" aria-hidden="true">{{ [...name][0]?.toUpperCase() }}</span>
          <span class="group-peer-name">{{ name }}</span>
        </RouterLink>
      </div>
      <div class="body"><Markdown :text="message.text" /></div>
    </div>
  </MessageContext>
</template>

<style scoped>
/* The author stands on a line of its own above the words; the entry is a flex row otherwise. */
.group-peer { flex-direction: column; align-items: stretch; margin-top: 10px; }
.group-peer.continues { margin-top: -10px; }
.group-peer-head { display: flex; align-items: center; margin-bottom: 8px; }
.group-peer-author { display: inline-flex; align-items: center; gap: 8px; min-width: 0; color: var(--peer-color); text-decoration: none; }
.group-peer-mark { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%; background: color-mix(in srgb, var(--peer-color) 22%, var(--bg)); color: var(--peer-color); font-size: 11px; font-weight: 700; line-height: 1; }
.group-peer-name { font-size: 13px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
/* The words sit in from the mark, under the name. */
.group-peer .body { padding-left: 30px; }
@media (hover: hover) { .group-peer-author:hover .group-peer-name { text-decoration: underline; } }
@media (max-width: 899px) { .group-peer .body { padding-left: 0; } }
</style>
