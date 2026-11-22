<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import {
  createLibraryFolder,
  renameLibraryFolder,
  deleteLibraryFolder,
  moveLibraryItems,
} from '../../core/api/endpoints.ts';
import type { LibraryFolder } from '../../core/api/types.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { folderTrail, type LibraryFolderAction } from './libraryFolders.ts';
const props = defineProps<{
  session: string;
  parent: string | null;
  folders: LibraryFolder[];
  action?: LibraryFolderAction;
  moveFiles?: (ids: string[], into: string | null) => void;
}>();
const emit = defineEmits<{ close: []; changed: [] }>();
const formId = useId();
const unchangedMove = computed(() => props.action?.kind === 'move' && destination.value === (props.action.from ?? '/'));
const name = ref(''),
  destination = ref('/'),
  busy = ref(false),
  error = ref('');
let controller: AbortController | undefined;
watch(
  [() => props.action, () => props.session],
  ([action], _, cleanup) => {
    controller?.abort();
    controller = undefined;
    name.value = action && 'folder' in action ? action.folder.name : '';
    destination.value = (action?.kind === 'move' ? action.from : props.parent) ?? '/';
    error.value = '';
    busy.value = false;
    cleanup(() => controller?.abort());
  },
  { immediate: true },
);
const title = computed(() =>
  props.action?.kind === 'move'
    ? tr('移动到文件夹', 'Move to folder')
    : props.action?.kind === 'rename'
      ? tr('重命名文件夹', 'Rename folder')
      : props.action?.kind === 'delete'
        ? props.action.folder.linked_path
          ? tr('移除链接', 'Remove link')
          : tr('删除文件夹', 'Delete folder')
        : tr('新建文件夹', 'New folder'),
);
const options = computed(() => [
  { value: '/', label: tr('库（根目录）', 'Library (root)'), icon: 'library' },
  ...props.folders
    .filter(
      (folder) =>
        !folder.linked_path &&
        (props.action?.kind !== 'move' ||
          !folderTrail(props.folders, folder.id).some(
            (parent) => props.action?.kind === 'move' && props.action.ids.includes(parent.id),
          )),
    )
    .map((folder) => ({
      value: folder.id,
      label: folderTrail(props.folders, folder.id)
        .map((item) => item.name)
        .join(' / '),
      icon: 'folder',
    }))
    .sort((a, b) => a.label.localeCompare(b.label)),
]);
async function submit() {
  const action = props.action;
  if (!action || busy.value || unchangedMove.value) return;
  if (action.kind === 'move' && props.moveFiles) {
    props.moveFiles(action.ids, destination.value === '/' ? null : destination.value);
    emit('close');
    return;
  }
  const request = new AbortController();
  controller = request;
  busy.value = true;
  error.value = '';
  try {
    const opts = { signal: request.signal };
    if (action.kind === 'create') await createLibraryFolder(props.session, name.value.trim(), props.parent, opts);
    else if (action.kind === 'rename')
      await renameLibraryFolder(props.session, action.folder.id, name.value.trim(), opts);
    else if (action.kind === 'delete') await deleteLibraryFolder(props.session, action.folder.id, opts);
    else if (action.kind === 'move')
      await moveLibraryItems(props.session, action.ids, destination.value === '/' ? null : destination.value, opts);
    if (!request.signal.aborted) {
      emit('changed');
      emit('close');
    }
  } catch (cause) {
    if (!request.signal.aborted) error.value = describeError(cause).message;
  } finally {
    if (controller === request) busy.value = false;
  }
}
</script>
<template>
  <Modal :open="!!action" compact :title="title" :dismissable="!busy" @close="emit('close')">
    <form :id="formId" class="library-folder-form" @submit.prevent="submit">
      <SelectField
        v-if="action?.kind === 'move'"
        v-model="destination"
        :options="options"
        :disabled="busy"
        :aria-label="title"
      />
      <p v-else-if="action?.kind === 'delete'">
        {{
          action?.kind === 'delete' && action.folder.linked_path
            ? tr(
                '仅移除库中的链接，原文件夹及其内容会保留。',
                'Only remove the Library link. The source folder and its contents will be kept.',
              )
            : tr(
                '仅删除空文件夹，请先移出其中的文件和子文件夹。',
                'Only empty folders can be deleted. Move their contents first.',
              )
        }}
      </p>
      <input
        v-else
        v-model="name"
        class="input"
        maxlength="255"
        :disabled="busy"
        :placeholder="tr('文件夹名称', 'Folder name')"
        :aria-label="tr('文件夹名称', 'Folder name')"
        data-initial-focus
      />
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn ghost" :disabled="busy" @click="emit('close')">
        {{ tr('取消', 'Cancel') }}
      </button>
      <button
        type="submit"
        class="btn"
        :class="action?.kind === 'delete' ? 'danger solid' : 'primary'"
        :form="formId"
        :disabled="busy || unchangedMove || ((action?.kind === 'create' || action?.kind === 'rename') && !name.trim())"
      >
        {{ title }}
      </button>
    </template>
  </Modal>
</template>
<style scoped>
.library-folder-form {
  display: grid;
  gap: 16px;
}
.library-folder-form .input {
  width: 100%;
}
.library-folder-form p {
  margin: 0;
  color: var(--fg-muted);
  font-size: 13px;
}
.library-folder-form [role='alert'] {
  color: var(--err);
}
</style>
