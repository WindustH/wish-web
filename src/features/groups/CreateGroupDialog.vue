<script setup lang="ts">
// Making a group: a name and the sessions in it. The user is in every group. On a phone it is a
// page, so the list of sessions has the height the keyboard leaves.
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { errorText } from '../../core/errors.ts';
import { tr } from '../../core/i18n/tr.ts';
import { sessions } from '../../core/state/sessionsSlice.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SessionPicker from './SessionPicker.vue';

// The folder it is made in; the root without one.
const props = defineProps<{ folder?: string | null }>();
const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const isMobile = useIsMobile();
const name = ref('');
const members = ref<string[]>([]);
const busy = ref(false);
const failed = ref('');
async function create() {
  busy.value = true;
  failed.value = '';
  try {
    const group = await sessions.createGroup(name.value.trim(), members.value, props.folder ?? null);
    emit('close');
    await router.push(`/g/${group.id}`);
  } catch (error) {
    failed.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal compact :page="isMobile" :open="true" :dismissable="!busy" :title="tr('新建群组', 'New group')" @close="emit('close')">
    <div class="create-group">
      <p class="create-group-what">{{ tr('群组是你和几个会话的聊天。每条消息都会发给其他所有成员并唤醒它们；会话像群里的一个人，读到消息后自己决定要不要在群里发言。会话需要开着 Shell 才能发言。', 'A group is a chat among you and several sessions. Every message goes to all the other members and wakes them; each session, like a person in the group, decides for itself whether to speak there. A session needs its shell to speak.') }}</p>
      <label class="create-group-name"><span>{{ tr('名称', 'Name') }}</span><input v-model="name" class="input" type="text" :placeholder="tr('例如：代码评审', 'e.g. Code review')" :disabled="busy" /></label>
      <div class="create-group-members">
        <span>{{ tr('成员', 'Members') }}<small v-if="members.length">{{ tr(` · 已选 ${members.length} 个`, ` · ${members.length} chosen`) }}</small></span>
        <SessionPicker v-model="members" />
      </div>
      <p v-if="failed" class="create-group-error" role="alert">{{ failed }}</p>
    </div>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn primary" :disabled="busy || !members.length" @click="create"><Icon v-if="busy" name="loader-circle" class="spin" />{{ tr('创建', 'Create') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.create-group { display: grid; gap: 14px; }
.create-group p { margin: 0; }
.create-group-what { color: var(--fg-muted); font-size: 13px; line-height: 1.6; }
.create-group-name, .create-group-members { display: grid; gap: 6px; }
.create-group-name > span, .create-group-members > span { color: var(--fg-muted); font-size: 12.5px; }
.create-group-members small { color: var(--fg-subtle); }
.create-group-error { color: var(--danger); font-size: 12.5px; }
@media (max-width: 899px) {
  .create-group { display: flex; flex-direction: column; min-height: 100%; }
  .create-group-members { display: flex; flex: 1; flex-direction: column; min-height: 0; }
}
</style>
