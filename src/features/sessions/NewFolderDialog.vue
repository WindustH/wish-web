<script setup lang="ts">
// Making a folder, in the root or in another folder.
import { ref } from 'vue';
import { errorDetail } from '../../core/errors.ts';
import { tr } from '../../core/i18n/tr.ts';
import { sessions } from '../../core/state/sessionsSlice.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';

const props = defineProps<{ parent: string | null }>();
const emit = defineEmits<{ close: [] }>();
const name = ref('');
const busy = ref(false);
const failed = ref('');
async function create() {
  if (!name.value.trim() || busy.value) return;
  busy.value = true;
  failed.value = '';
  try {
    await sessions.createFolder(name.value.trim(), props.parent);
    emit('close');
  } catch (error) {
    failed.value = errorDetail(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal compact :open="true" :dismissable="!busy" :title="parent ? tr('新建子文件夹', 'New folder inside') : tr('新建文件夹', 'New folder')" @close="emit('close')">
    <form class="new-folder" @submit.prevent="create">
      <input v-model="name" class="input" data-initial-focus :placeholder="tr('文件夹名称', 'Folder name')" :aria-label="tr('文件夹名称', 'Folder name')" :disabled="busy" />
      <p v-if="failed" class="new-folder-error" role="alert">{{ failed }}</p>
    </form>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn primary" :disabled="busy || !name.trim()" @click="create"><Icon v-if="busy" name="loader-circle" class="spin" />{{ tr('创建', 'Create') }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.new-folder { display: grid; gap: 8px; }
.new-folder-error { margin: 0; color: var(--danger); font-size: 12.5px; }
</style>
