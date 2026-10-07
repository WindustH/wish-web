<script setup lang="ts">
// A group's chat: its bar, its transcript, and a composer that posts to it. The group's window
// opens from the bar; the transcript catches up whenever the group announces a change.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as api from '../../core/api/endpoints.ts';
import type { GroupMessage, GroupView } from '../../core/api/types.ts';
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

const group = shallowRef<GroupView | null>(null);
// The transcript as far back as it has been read, oldest first.
const messages = shallowRef<GroupMessage[]>([]);
// Where reading further back starts; null once the start is read.
const older = ref<number | null>(null);
const loading = ref(false);
const failed = ref<unknown>(null);
const infoOpen = ref(false);
// Each group opened starts a generation; answers for an earlier one are dropped.
let generation = 0;

/** Adds messages read since, each once, in order. */
function append(fresh: GroupMessage[]) {
  const last = messages.value.at(-1)?.seq ?? -1;
  const newer = fresh.filter(message => message.seq > last).sort((a, b) => a.seq - b.seq);
  if (newer.length) messages.value = [...messages.value, ...newer];
}

async function open(gid: string) {
  const own = ++generation;
  group.value = null;
  messages.value = [];
  older.value = null;
  failed.value = null;
  infoOpen.value = false;
  loading.value = true;
  try {
    const [record, page] = await Promise.all([api.groupGet(gid), api.groupMessages(gid)]);
    if (own !== generation) return;
    group.value = record;
    messages.value = page.items.reverse();
    older.value = page.next;
  } catch (error: any) {
    if (own !== generation) return;
    if (error?.status === 404) leave();
    else failed.value = error;
  } finally {
    if (own === generation) loading.value = false;
  }
}
watch(id, open, { immediate: true });

async function readOlder() {
  const own = generation;
  if (older.value == null || loading.value) return;
  loading.value = true;
  try {
    const page = await api.groupMessages(id.value, { before: older.value });
    if (own !== generation) return;
    messages.value = [...page.items.reverse(), ...messages.value];
    older.value = page.next;
  } catch (error) {
    if (own === generation) toast(errorDetail(error));
  } finally {
    if (own === generation) loading.value = false;
  }
}

/** Reads what changed since: the record, and the messages after the last one shown. */
async function catchUp() {
  const own = generation;
  const last = messages.value.at(-1)?.seq ?? -1;
  const record = api.groupGet(id.value);
  const fresh: GroupMessage[] = [];
  let before: number | undefined;
  for (;;) {
    const page = await api.groupMessages(id.value, { before });
    if (own !== generation) return;
    const newer = page.items.filter(message => message.seq > last);
    fresh.push(...newer);
    if (newer.length < page.items.length || page.next == null) break;
    before = page.next;
  }
  const changed = await record;
  if (own !== generation) return;
  group.value = changed;
  append(fresh);
}
function leave() {
  void router.replace({ name: isMobile.value ? 'sessions' : 'new-chat' });
}
const stopChanged = bus.on('upsert.group', (event: { id: string }) => {
  if (event.id === id.value && group.value) catchUp().catch(() => {});
});
const stopDeleted = bus.on('tombstone.group', (event: { id: string }) => {
  if (event.id === id.value) leave();
});
onBeforeUnmount(() => { stopChanged(); stopDeleted(); });

async function post(text: string, attachments: AttachmentInput[]) {
  const gid = id.value;
  const { blocks } = await uploadAttachments(gid, attachments, { upload: api.uploadGroupBlob });
  const { message } = await api.groupPost(gid, { content: text, blocks });
  if (gid === id.value) append([message]);
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
      <Hint :text="infoLabel"><button class="btn ghost icon-only" :aria-label="infoLabel" :disabled="!group" :aria-pressed="infoOpen"
        :class="{ selected: infoOpen }" @click="infoOpen = !infoOpen"><Icon name="info" /></button></Hint>
    </div>
    <div v-if="failed" class="load-error" role="alert">
      <span>{{ errorDetail(failed) }}</span>
      <button class="btn ghost sm" @click="open(id)">{{ i18n.t('common.retry') }}</button>
    </div>
    <GroupLog :group-id="id" :messages="messages" :loading="loading" :has-older="older != null" @older="readOlder" />
    <Composer :owner="id" :mobile="isMobile" :disabled="!group" :send-message="post" />
    <GroupMembers v-if="infoOpen && group" :group="group" @changed="group = $event" @close="infoOpen = false" />
  </div>
</template>
