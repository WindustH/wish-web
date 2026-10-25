<script setup lang="ts">
// A group's chat: its bar, its transcript, and a composer that posts to it. The group's window
// opens from the bar; the transcript catches up whenever the group announces a change.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.ts';
import { createGroupHistory } from './groupHistory.ts';
import { createReconciliation } from '../../core/state/reconciliation.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { uploadAttachments, type AttachmentInput } from '../../core/attachments.ts';
import { bus } from '../../core/bus.ts';
import { errorDetail } from '../../core/errors.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import FadeText from '../../ui/components/FadeText.vue';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { toast } from '../../ui/toast.ts';
import { sessionParent } from '../shell/sessionNavigation.ts';
import Composer from '../sessions/Composer.vue';
import GroupLog from './GroupLog.vue';
import GroupMembers from './GroupMembers.vue';

const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();
const id = computed(() => route.params.id as string);

const history = createGroupHistory(api);
const { group, messages, older, loading, failed, append } = history;
const infoOpen = ref(false);
const active = usePageActivity();
const reconciliation = createReconciliation({
  run: () => history.catchUp().catch(() => {}),
  ready: () => active.value && !!group.value,
  delayMs: 250, pollMs: 5000,
});
let generation = 0;
async function open(gid: string) {
  const own = ++generation;
  reconciliation.stop(); infoOpen.value = false;
  await history.open(gid);
  if (own !== generation) return;
  if ((failed.value as { status?: number })?.status === 404) leave();
  if (active.value) { reconciliation.start(); reconciliation.request(); }
}
watch(id, open, { immediate: true });
watch(active, value => {
  if (value) { reconciliation.start(); reconciliation.request(); }
  else reconciliation.stop();
});
async function readOlder() {
  try { await history.readOlder(); }
  catch (error) { if ((error as Error)?.name !== 'AbortError') toast(errorDetail(error)); }
}
function leave() {
  void router.replace({ name: isMobile.value ? 'sessions' : 'new-chat' });
}
const stopChanged = bus.on('upsert.group', (event: { id: string }) => {
  if (event.id === id.value) reconciliation.request();
});
const stopDeleted = bus.on('tombstone.group', (event: { id: string }) => {
  if (event.id === id.value) leave();
});
onBeforeUnmount(() => { generation++; reconciliation.stop(); history.stop(); stopChanged(); stopDeleted(); });

async function post(text: string, attachments: AttachmentInput[]) {
  const gid = id.value, own = generation;
  const { blocks } = await uploadAttachments(gid, attachments, { upload: api.uploadGroupBlob });
  const { message } = await api.groupPost(gid, { content: text, blocks });
  if (own === generation) append([message]);
  return String(message.seq);
}

const memberCount = computed(() => group.value?.members.length ?? 0);
const infoLabel = tr('群组信息', 'Group info');
</script>

<template>
  <div class="chat-pane group-pane">
    <div class="chatbar">
      <button v-if="isMobile" class="btn ghost icon-only" :aria-label="i18n.t('chatbar.back')"
        @click="router.push(sessionParent)"><Icon name="arrow-left" /></button>
      <div class="chat-title">
        <span v-if="!group" class="chat-skeleton title-skeleton" :aria-label="i18n.t('sessions.loading')" role="status" />
        <template v-else>
          <FadeText class="name" :text="group.name || tr('未命名群组', 'Untitled group')" />
          <span class="group-count">{{ tr(`${memberCount} 个成员`, `${memberCount} member${memberCount === 1 ? '' : 's'}`) }}</span>
        </template>
      </div>
      <Hint :text="infoLabel"><button class="btn ghost icon-only" :aria-label="infoLabel" :disabled="!group" data-session-panel="info" :aria-pressed="infoOpen"
        :class="{ selected: infoOpen }" @click="infoOpen = !infoOpen"><Icon name="info" /></button></Hint>
    </div>
    <div v-if="failed" class="load-error" role="alert">
      <span>{{ errorDetail(failed) }}</span>
      <button class="btn ghost sm" @click="open(id)">{{ i18n.t('common.retry') }}</button>
    </div>
    <GroupLog :key="id" :group-id="id" :messages="messages" :loading="loading" :has-older="older != null" @older="readOlder" />
    <Composer :owner="id" :mobile="isMobile" :disabled="!group" :send-message="post" />
    <GroupMembers v-if="infoOpen && group" :group="group" @changed="group = $event" @close="infoOpen = false" />
  </div>
</template>
