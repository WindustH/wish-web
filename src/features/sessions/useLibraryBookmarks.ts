import { inject, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { LibraryBookmark } from '../../core/api/types.ts';
import { libraryBookmarks, renameLibraryBookmark, deleteLibraryBookmark } from '../../core/api/endpoints.ts';
import { bus } from '../../core/bus.ts';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { replyContextKey } from '../../domain/references/context.ts';
import { ApiError } from '../../core/api/client.ts';
import { toast } from '../../ui/toast.ts';
export function useLibraryBookmarks(owner: Readonly<Ref<string>>, active: Readonly<Ref<boolean>>) {
  const replies = inject(replyContextKey, undefined);
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
      const result = await libraryBookmarks(owner.value, { signal: request.signal });
      if (!request.signal.aborted) items.value = Array.isArray(result) ? result : [];
    } catch (cause) {
      if (!request.signal.aborted && !(cause instanceof ApiError && cause.status === 404))
        error.value = describeError(cause).message;
    } finally {
      if (controller === request) loading.value = false;
    }
  }
  watch(
    [owner, active],
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
      if (session === owner.value) void load();
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
    const session = owner.value;
    const request = new AbortController();
    removals.add(request);
    busy.value.add(item.id);
    try {
      await deleteLibraryBookmark(session, item.id, { signal: request.signal });
      if (!request.signal.aborted && session === owner.value) items.value = items.value.filter((b) => b.id !== item.id);
    } catch (cause) {
      if (!request.signal.aborted && session === owner.value) toast(describeError(cause).message);
    } finally {
      removals.delete(request);
      if (!request.signal.aborted) busy.value.delete(item.id);
    }
  }
  function locate(item: LibraryBookmark) {
    replies?.locate({
      id: item.id,
      session: owner.value,
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
    if (editing.value) await renameLibraryBookmark(owner.value, editing.value.id, name, { signal });
  }

  return { items, error, loading, editing, busy, load, actions, action, locate, rename };
}
