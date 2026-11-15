<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue';
import type { LibraryBookmark } from '../../core/api/types.ts';
import { libraryBookmarks, renameLibraryBookmark, deleteLibraryBookmark } from '../../core/api/endpoints.ts';
import { bus } from '../../core/bus.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { replyContextKey } from '../../domain/references/context.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import Icon from '../../ui/components/Icon.vue';
import Menu from '../../ui/components/Menu.vue';
import { toast } from '../../ui/toast.ts';
import LibraryRenameDialog from './LibraryRenameDialog.vue';
const props = defineProps<{ session: string }>();
const replies = inject(replyContextKey, undefined),
  active = usePageActivity();
const items = ref<LibraryBookmark[]>([]),
  error = ref(''),
  loading = ref(false),
  editing = ref<LibraryBookmark>();
const busy = ref(new Set<string>());
const removals = new Set<AbortController>();
function cancelRemovals() {
  for (const request of removals) request.abort();
  removals.clear();
  busy.value.clear();
}
let controller: AbortController | undefined;
async function load() {
  controller?.abort();
  if (!active.value) return;
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = '';
  try {
    const result = await libraryBookmarks(props.session, { signal: request.signal });
    if (!request.signal.aborted) items.value = result;
  } catch (cause) {
    if (!request.signal.aborted) error.value = describeError(cause).message;
  } finally {
    if (controller === request) loading.value = false;
  }
}
watch(
  [() => props.session, active],
  () => {
    cancelRemovals();
    editing.value = undefined;
    items.value = [];
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  controller?.abort();
  cancelRemovals();
});
onBeforeUnmount(
  bus.on('library.bookmarks.changed', ({ session }) => {
    if (session === props.session) void load();
  }),
);
const actions = () => [
  { key: 'rename', icon: 'pencil', label: tr('重命名', 'Rename') },
  { key: 'delete', icon: 'trash-2', label: tr('移除书签', 'Remove bookmark'), danger: true },
];
async function action(key: string, item: LibraryBookmark) {
  if (key === 'rename') {
    editing.value = item;
    return;
  }
  if (key !== 'delete' || busy.value.has(item.id)) return;
  const session = props.session;
  const request = new AbortController();
  removals.add(request);
  busy.value.add(item.id);
  try {
    await deleteLibraryBookmark(session, item.id, { signal: request.signal });
    if (!request.signal.aborted && session === props.session) items.value = items.value.filter((b) => b.id !== item.id);
  } catch (cause) {
    if (!request.signal.aborted && session === props.session) toast(describeError(cause).message);
  } finally {
    removals.delete(request);
    if (!request.signal.aborted) busy.value.delete(item.id);
  }
}
function locate(item: LibraryBookmark) {
  replies?.locate({
    id: item.id,
    session: props.session,
    source: `message_${item.seq}`,
    seq: item.seq,
    label: item.name,
    text: item.text,
    block: item.block ?? undefined,
    start: item.start ?? undefined,
    end: item.end ?? undefined,
  });
}
async function rename(name: string, signal: AbortSignal) {
  if (editing.value) await renameLibraryBookmark(props.session, editing.value.id, name, { signal });
}
</script>
<template>
  <section class="library-bookmarks" :aria-label="tr('书签', 'Bookmarks')" :aria-busy="loading">
    <p v-if="error" role="alert">
      {{ error }} <button class="btn sm" @click="load">{{ tr('重试', 'Retry') }}</button>
    </p>
    <p v-else-if="!items.length" class="empty">
      {{
        loading
          ? tr('加载中…', 'Loading…')
          : tr('在消息或选中文本的菜单中添加书签。', 'Bookmark a message or selected text from its menu.')
      }}
    </p>
    <Menu
      v-for="item in items"
      :key="item.id"
      context
      :items="actions()"
      :disabled="busy.has(item.id)"
      @select="action($event, item)"
    >
      <div class="library-bookmark">
        <button type="button" class="bookmark-open" :data-bookmark-id="item.id" @click="locate(item)">
          <Icon name="bookmark" :size="20" />
          <span
            ><strong>{{ item.name }}</strong
            ><small>{{ item.block == null ? tr('整条消息', 'Message') : tr('消息片段', 'Excerpt') }}</small
            ><span class="excerpt">{{ item.text }}</span></span
          >
        </button>
        <Menu :items="actions()" :disabled="busy.has(item.id)" @select="action($event, item)"
          ><template #trigger
            ><button class="btn ghost icon-only" :aria-label="tr('书签操作', 'Bookmark actions')">
              <Icon name="ellipsis-vertical" /></button></template
        ></Menu>
      </div>
    </Menu>
  </section>
  <LibraryRenameDialog
    :open="!!editing"
    :name="editing?.name ?? ''"
    :save="rename"
    @close="editing = undefined"
    @saved="load"
  />
</template>
<style scoped>
.library-bookmarks {
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
}
.empty,
[role='alert'] {
  color: var(--fg-muted);
  font-size: 14px;
}
.library-bookmark {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  border-bottom: 1px solid var(--line);
  padding: 8px 0;
}
.bookmark-open {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 12px;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--fg);
  text-align: start;
  cursor: pointer;
}
.bookmark-open > span {
  min-width: 0;
  display: grid;
  gap: 6px;
}
.bookmark-open .icon {
  flex-shrink: 0;
  color: var(--accent);
}
strong {
  overflow-wrap: anywhere;
  font-size: 14px;
}
small {
  color: var(--fg-muted);
  font-size: 12px;
}
.excerpt {
  color: var(--fg-muted);
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
@media (hover: hover) {
  .bookmark-open:hover {
    background: var(--bg-hover);
  }
}
</style>
