<script setup lang="ts">
// Deleting several sessions or groups at once, after asking. Each goes like a single delete: its
// row leaves the list, an open conversation with it closes, and a page showing it goes back to the
// list. A group takes its messages and files with it, never its sessions.
import { errorText } from '../../core/errors.ts';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fmtBytes } from '../../core/util/fmt.ts';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { showError } from '../../ui/errorDialog.ts';
import { deleteSession } from './sessionActions.ts';
import { sessions } from '../../core/state/sessionsSlice.ts';

const props = defineProps<{
  targets: { id: string; name: string; group?: boolean }[];
  // What they keep, when the caller knows it.
  bytes?: number;
}>();
const emit = defineEmits<{ close: []; deleted: [] }>();
const route = useRoute();
const router = useRouter();
const deleting = ref(false);

async function remove() {
  deleting.value = true;
  const failures: string[] = [];
  let shown = false;
  for (const item of props.targets) {
    try {
      await (item.group ? sessions.deleteGroup(item.id) : deleteSession(item.id));
      shown ||= route.params.id === item.id;
    } catch (error) {
      failures.push(`${item.name}: ${errorText(error)}`);
    }
  }
  deleting.value = false;
  if (shown) await router.push('/sessions');
  emit('deleted');
  if (failures.length) showError({ title: tr('有些没有删除', 'Some were not deleted'), error: failures.join('\n') });
}
const groups = computed(() => props.targets.filter(item => item.group).length);
const title = computed(() => {
  const count = props.targets.length;
  if (!groups.value) return tr(`删除 ${count} 个会话？`, `Delete ${count} session${count === 1 ? '' : 's'}?`);
  if (groups.value === count) return tr(`删除 ${count} 个群组？`, `Delete ${count} group${count === 1 ? '' : 's'}?`);
  return tr(`删除 ${count} 项？`, `Delete ${count} items?`);
});
</script>

<template>
  <Modal compact :open="true" :dismissable="!deleting" :title="title" @close="emit('close')">
    <p v-if="groups">{{ bytes != null
      ? tr(`这些会话连同历史、附件和命令输出，群组连同聊天记录和发到群里的文件，会被永久删除（共 ${fmtBytes(bytes)}），无法恢复。群组里的会话不受影响。`, `These sessions with their history, attachments and command output, and these groups with their messages and files (${fmtBytes(bytes)}), are deleted for good. The sessions in the groups stay.`)
      : tr('这些会话连同历史、附件和命令输出，群组连同聊天记录和发到群里的文件，会被永久删除，无法恢复。群组里的会话不受影响。', 'These sessions with their history, attachments and command output, and these groups with their messages and files, are deleted for good. The sessions in the groups stay.') }}</p>
    <p v-else>{{ bytes != null
      ? tr(`这些会话连同历史、附件和命令输出会被永久删除（共 ${fmtBytes(bytes)}），无法恢复。`, `These sessions and their history, attachments and command output (${fmtBytes(bytes)}) are deleted for good. This cannot be undone.`)
      : tr('这些会话连同历史、附件和命令输出会被永久删除，无法恢复。', 'These sessions and their history, attachments and command output are deleted for good. This cannot be undone.') }}</p>
    <template #footer>
      <button class="btn ghost" :disabled="deleting" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn danger solid" :disabled="deleting" @click="remove"><Icon v-if="deleting" name="loader-circle" class="spin" />{{ tr('删除', 'Delete') }}</button>
    </template>
  </Modal>
</template>
