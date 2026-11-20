<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { LibraryFolder, LinkedFolderChild } from '../../core/api/types.ts';
import { linkedFolderChildren, renameLinkedFolderChild } from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';
import LibraryRenameDialog from './LibraryRenameDialog.vue';
import { linkedFileKind, type BlobKind } from './libraryFiles.ts';
const props = defineProps<{
  session: string;
  folder: LibraryFolder;
  revision: number;
  filter?: BlobKind | 'all' | 'bookmarks';
}>();
const emit = defineEmits<{ open: [child: LinkedFolderChild] }>();
const active = usePageActivity();
const saved = useWorkspaceState('linked-folder', () => `${props.session}/${props.folder.id}`, { path: '' });
const path = computed(() => saved.value.path);
const trail = computed(() => path.value.split('/').filter(Boolean));
const items = ref<LinkedFolderChild[]>([]),
  next = ref<string | null>(null),
  loading = ref(false),
  error = ref(''),
  editing = ref<LinkedFolderChild>();
let controller: AbortController | undefined;
async function load(append = false) {
  controller?.abort();
  if (!active.value) return;
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = '';
  if (!append) {
    items.value = [];
    next.value = null;
  }
  try {
    const page = await linkedFolderChildren(
      props.session,
      props.folder.id,
      path.value,
      append ? (next.value ?? undefined) : undefined,
      { signal: request.signal },
    );
    if (!request.signal.aborted) {
      items.value = append ? [...items.value, ...page.items] : page.items;
      next.value = page.next;
    }
  } catch (cause) {
    if (!request.signal.aborted) error.value = describeError(cause).message;
  } finally {
    if (controller === request) loading.value = false;
  }
}
watch(
  [() => props.session, () => props.folder.id, () => props.revision, path, active],
  () => {
    editing.value = undefined;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
function back() {
  if (!path.value) return false;
  saved.value.path = path.value.split('/').slice(0, -1).join('/');
  return true;
}
defineExpose({ back });
function open(item: LinkedFolderChild) {
  if (item.directory) saved.value.path = item.path;
  else emit('open', item);
}
async function rename(name: string, signal: AbortSignal) {
  if (editing.value)
    await renameLinkedFolderChild(props.session, props.folder.id, editing.value.path, name, { signal });
}
const actions = () => [{ key: 'rename', icon: 'pencil', label: tr('重命名', 'Rename') }];
const shown = computed(() =>
  items.value.filter(
    (item) =>
      !props.filter ||
      props.filter === 'all' ||
      (props.filter !== 'bookmarks' && (item.directory || linkedFileKind(item.name) === props.filter)),
  ),
);
</script>
<template>
  <section class="linked-folder-browser" :aria-busy="loading">
    <nav class="linked-folder-trail" :aria-label="tr('链接文件夹路径', 'Linked folder path')">
      <button class="btn ghost sm" :title="folder.linked_path ?? ''" @click="saved.path = ''">
        <Icon name="link" :size="14" />{{ folder.name }}
      </button>
      <template v-for="(part, index) in trail" :key="index"
        ><Icon name="chevron-right" :size="12" /><button
          class="btn ghost sm"
          @click="saved.path = trail.slice(0, index + 1).join('/')"
        >
          {{ part }}
        </button></template
      >
      <button class="btn ghost icon-only sm" :aria-label="tr('刷新', 'Refresh')" :disabled="loading" @click="load()">
        <Icon name="refresh-cw" :size="16" />
      </button>
    </nav>
    <p v-if="error" role="alert">
      {{ error }} <button class="btn sm" @click="load()">{{ tr('重试', 'Retry') }}</button>
    </p>
    <p v-else-if="!loading && !shown.length">
      {{ items.length ? tr('没有匹配的文件', 'No matching files') : tr('文件夹为空', 'Folder is empty') }}
    </p>
    <Menu v-for="item in shown" :key="item.path" context :items="actions()" @select="editing = item">
      <div class="linked-folder-row">
        <button class="linked-child" :data-linked-path="item.path" @click="open(item)">
          <Icon :name="item.directory ? 'folder' : 'instruction'" /><span
            ><strong>{{ item.display_name || item.name }}</strong
            ><small v-if="item.display_name">{{ item.name }}</small></span
          ><small>{{ item.directory ? tr('文件夹', 'Folder') : fmtBytes(item.byte_count) }}</small
          ><Icon v-if="item.directory" name="chevron-right" :size="14" />
        </button>
        <Menu :items="actions()" @select="editing = item"
          ><template #trigger
            ><button class="btn ghost icon-only" :aria-label="tr('文件操作', 'File actions')">
              <Icon name="ellipsis-vertical" /></button></template
        ></Menu>
      </div>
    </Menu>
    <button data-workspace-item v-if="next" class="btn ghost" :disabled="loading" @click="load(true)">
      {{ tr('加载更多', 'Load more') }}
    </button>
    <p v-if="loading" role="status">{{ tr('加载中…', 'Loading…') }}</p>
  </section>
  <LibraryRenameDialog
    :open="!!editing"
    :name="editing?.display_name || editing?.name || ''"
    :save="rename"
    @close="editing = undefined"
    @saved="load()"
  />
</template>
<style scoped>
.linked-folder-browser {
  overflow: auto;
  min-height: 0;
  padding: 8px 16px 20px;
}
.linked-folder-trail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding-bottom: 8px;
}
.linked-folder-trail button {
  overflow-wrap: anywhere;
}
.linked-folder-row {
  display: flex;
  align-items: center;
}
.linked-child {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 12px 4px;
  border: 0;
  border-radius: 6px;
  text-align: start;
  background: none;
  color: var(--fg);
  cursor: pointer;
}
.linked-child:focus-visible {
  outline: none;
  background: var(--bg-hover);
}
@media (forced-colors: active) {
  .linked-child:focus-visible strong {
    text-decoration: underline;
  }
}
.linked-child > span {
  display: grid;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.linked-child > .icon,
.linked-child > small {
  flex-shrink: 0;
}
strong {
  font-size: 14px;
  font-weight: 500;
}
small,
p {
  color: var(--fg-muted);
  font-size: 12px;
}
@media (hover: hover) {
  .linked-child:hover {
    background: var(--bg-hover);
  }
}
</style>
