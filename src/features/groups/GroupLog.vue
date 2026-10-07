<script setup lang="ts">
// A group's transcript, oldest at the top: it keeps to the bottom while the user is there, and
// asks for older messages as the user scrolls up to them, holding its place.
import { computed, nextTick, ref, watch } from 'vue';
import type { GroupMessage } from '../../core/api/types.ts';
import { i18n } from '../../core/i18n/index.ts';
import GroupMessageItem from './GroupMessageItem.vue';

const props = defineProps<{ groupId: string; messages: GroupMessage[]; loading: boolean; hasOlder: boolean }>();
const emit = defineEmits<{ older: [] }>();
const scrollEl = ref<HTMLElement | null>(null);
// Whether the view is at the bottom, where new messages keep it.
let following = true;
// The height below the top of the view when older messages were asked for, to hold its place.
let heightBefore: number | null = null;

const rows = computed(() => props.messages.map((message, index) => {
  const previous = props.messages[index - 1];
  const continues = message.author.kind === 'session' && previous?.author.kind === 'session' && previous.author.id === message.author.id;
  return { message, continues };
}));

function onScroll() {
  const el = scrollEl.value!;
  following = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  if (el.scrollTop < 200) askOlder(el);
}
function askOlder(el: HTMLElement) {
  if (!props.hasOlder || props.loading) return;
  heightBefore = el.scrollHeight - el.scrollTop;
  emit('older');
}
watch(() => props.messages, async (now, before) => {
  await nextTick();
  const el = scrollEl.value;
  if (!el) return;
  const prepended = before?.length && now.length > before.length && now[0]?.seq !== before[0]?.seq;
  if (prepended && heightBefore != null) el.scrollTop = el.scrollHeight - heightBefore;
  else if (following) el.scrollTop = el.scrollHeight;
  heightBefore = null;
  // Too few to scroll leaves nothing to scroll up by: read further back at once.
  if (el.scrollHeight <= el.clientHeight) askOlder(el);
}, { flush: 'post' });
watch(() => props.groupId, () => { following = true; heightBefore = null; });
</script>

<template>
  <div class="chatlog-wrap">
    <div ref="scrollEl" class="chatlog" tabindex="0" @scroll.passive="onScroll">
      <div class="chatlog-content">
        <div v-if="loading && !messages.length" class="history-skeleton" role="status" :aria-label="i18n.t('sessions.loading')" aria-busy="true">
          <div class="chat-skeleton skeleton-user" aria-hidden="true" />
        </div>
        <div v-else-if="!messages.length" class="chat-empty hint">{{ i18n.t('chat.empty') }}</div>
        <div class="chatlog-inner group-log">
          <GroupMessageItem v-for="row in rows" :key="row.message.seq" :message="row.message" :group-id="groupId" :continues="row.continues" />
        </div>
      </div>
    </div>
  </div>
</template>
