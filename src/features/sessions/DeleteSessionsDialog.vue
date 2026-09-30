<script setup lang="ts">
// Deleting several sessions at once, after asking. Each goes like a single delete: its row leaves
// the list, an open conversation with it closes, and a page showing it goes back to the list.
import { errorText } from '../../core/errors.ts';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fmtBytes } from '../../core/util/fmt.ts';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { showError } from '../../ui/errorDialog.ts';
import { deleteSession } from './sessionActions.ts';

const props = defineProps<{
  targets: { id: string; name: string }[];
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
      await deleteSession(item.id);
      shown ||= route.params.id === item.id;
    } catch (error) {
      failures.push(`${item.name}: ${errorText(error)}`);
    }
  }
  deleting.value = false;
  if (shown) await router.push('/sessions');
  emit('deleted');
  if (failures.length) showError({ title: tr('有些会话没有删除', 'Some sessions were not deleted'), error: failures.join('\n') });
}
</script>

<template>
  <Modal compact :open="true" :dismissable="!deleting" :title="tr(`删除 ${targets.length} 个会话？`, `Delete ${targets.length} session${targets.length === 1 ? '' : 's'}?`)" @close="emit('close')">
    <p>{{ bytes != null
      ? tr(`这些会话连同历史、附件和命令输出会被永久删除（共 ${fmtBytes(bytes)}），无法恢复。`, `These sessions and their history, attachments and command output (${fmtBytes(bytes)}) are deleted for good. This cannot be undone.`)
      : tr('这些会话连同历史、附件和命令输出会被永久删除，无法恢复。', 'These sessions and their history, attachments and command output are deleted for good. This cannot be undone.') }}</p>
    <template #footer>
      <button class="btn ghost" :disabled="deleting" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn danger solid" :disabled="deleting" @click="remove"><Icon v-if="deleting" name="loader-circle" class="spin" />{{ tr('删除', 'Delete') }}</button>
    </template>
  </Modal>
</template>
