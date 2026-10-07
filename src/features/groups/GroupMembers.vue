<script setup lang="ts">
// A group's window: who is in it and how they are woken, with members to add and remove.
import { ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import * as api from '../../core/api/endpoints.ts';
import type { GroupView } from '../../core/api/types.ts';
import { errorText } from '../../core/errors.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
import { fmtDateTime } from '../../core/util/fmt.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SessionPicker from './SessionPicker.vue';

const props = defineProps<{ group: GroupView }>();
const emit = defineEmits<{ close: []; changed: [group: GroupView] }>();
const isMobile = useIsMobile();

// The name of each member, and of the session that made the group, as their sessions have it now.
const names = ref<Record<string, string>>({});
watch(() => [...props.group.members, props.group.created_by ?? ''], async (sessions) => {
  const missing = sessions.filter(id => id && !(id in names.value));
  const found = await Promise.all(missing.map(id => api.sessionGet(id).then(sessionTitle, () => id.slice(0, 8))));
  names.value = { ...names.value, ...Object.fromEntries(missing.map((id, index) => [id, found[index]!])) };
}, { immediate: true });

const adding = ref(false);
const added = ref<string[]>([]);
const busy = ref(false);
const failed = ref('');
async function setMembers(members: string[]) {
  busy.value = true;
  failed.value = '';
  try {
    emit('changed', await api.groupUpdate(props.group.id, { members }));
    adding.value = false;
    added.value = [];
  } catch (error) {
    failed.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="true" content-class="session-window" :title="tr('群组信息', 'Group info')" :page="isMobile" @close="emit('close')">
    <header class="info-hero">
      <span class="info-mark"><Icon name="users" class="group-mark" /></span>
      <div class="info-hero-text">
        <strong>{{ group.name || tr('未命名群组', 'Untitled group') }}</strong>
        <small>{{ tr(`你和 ${group.members.length} 个会话`, `You and ${group.members.length} session${group.members.length === 1 ? '' : 's'}`) }}</small>
      </div>
    </header>

    <section class="info-card">
      <header class="info-card-head"><h4>{{ tr('成员', 'Members') }}</h4><button type="button" class="btn ghost sm" :disabled="busy" @click="adding = true">{{ tr('添加', 'Add') }}</button></header>
      <ul class="info-members">
        <li v-for="id in group.members" :key="id">
          <RouterLink :to="`/s/${id}`" class="info-member">{{ names[id] ?? id.slice(0, 8) }}</RouterLink>
          <button type="button" class="btn ghost icon-only sm" :aria-label="tr('移出群组', 'Remove from the group')" :disabled="busy" @click="setMembers(group.members.filter(member => member !== id))"><Icon name="x" /></button>
        </li>
        <li v-if="!group.members.length" class="info-members-empty">{{ tr('还没有成员。', 'No members yet.') }}</li>
      </ul>
      <p v-if="failed && !adding" class="info-members-error" role="alert">{{ failed }}</p>
      <p class="hint">{{ tr('每条消息都会发给其他所有成员并唤醒它们；会话自己决定要不要在群里发言，需要开着 Shell。', 'Every message goes to all the other members and wakes them; each session decides for itself whether to speak, which needs its shell.') }}</p>
    </section>

    <section class="info-card">
      <dl class="info-facts">
        <div v-if="group.created_by" class="wide"><dt>{{ tr('创建者', 'Made by') }}</dt><dd><RouterLink :to="`/s/${group.created_by}`" class="info-member">{{ names[group.created_by] ?? group.created_by.slice(0, 8) }}</RouterLink></dd></div>
        <div class="wide"><dt>{{ i18n.t('info.createdAt') }}</dt><dd>{{ fmtDateTime(group.created_at) }}</dd></div>
        <div class="wide"><dt>{{ i18n.t('info.updatedAt') }}</dt><dd>{{ fmtDateTime(group.updated_at) }}</dd></div>
      </dl>
    </section>

    <Modal v-if="adding" compact :page="isMobile" :open="true" :dismissable="!busy" :title="tr('添加成员', 'Add members')" @close="adding = false">
      <div class="add-members">
        <SessionPicker v-model="added" :excluded="group.members" />
        <p v-if="failed" class="info-members-error" role="alert">{{ failed }}</p>
      </div>
      <template #footer>
        <button class="btn ghost" :disabled="busy" @click="adding = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn primary" :disabled="busy || !added.length" @click="setMembers([...group.members, ...added])">{{ tr('添加', 'Add') }}</button>
      </template>
    </Modal>
  </Modal>
</template>

<style scoped>
.group-mark { width: 22px; height: 22px; color: var(--fg-muted); }
/* On a phone it is a page, and the list takes the height the keyboard leaves. */
@media (max-width: 899px) { .add-members { display: flex; flex-direction: column; min-height: 100%; } }
</style>
