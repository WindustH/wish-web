import { shallowRef, ref } from 'vue';
import type { GroupMessage, GroupView } from '../../core/api/types.ts';
import type * as api from '../../core/api/endpoints.ts';
import { mergeHistory } from '../../core/state/mergeHistory.ts';

/** One group's read window. Transport and cursors belong to this owner, never to the view. */
export function createGroupHistory(requests: Pick<typeof api, 'groupGet' | 'groupMessages'>) {
  const group = shallowRef<GroupView | null>(null);
  const messages = shallowRef<GroupMessage[]>([]);
  const older = ref<number | null>(null),
    loading = ref(false),
    failed = shallowRef<unknown>(null);
  let controller = new AbortController(),
    id = '',
    watermark = -1;
  let syncing: Promise<void> | undefined;
  function stop() {
    controller.abort();
    syncing = undefined;
  }
  function append(items: GroupMessage[]) {
    messages.value = mergeHistory(messages.value, items);
  }
  async function open(gid: string) {
    stop();
    controller = new AbortController();
    id = gid;
    const signal = controller.signal;
    group.value = null;
    messages.value = [];
    older.value = null;
    failed.value = null;
    loading.value = true;
    watermark = -1;
    try {
      const [record, page] = await Promise.all([
        requests.groupGet(gid, { signal }),
        requests.groupMessages(gid, {}, { signal }),
      ]);
      if (signal.aborted) return;
      group.value = record;
      append(page.items);
      older.value = page.next;
      watermark = messages.value.at(-1)?.seq ?? -1;
    } catch (error) {
      if (!signal.aborted) failed.value = error;
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  }
  async function readOlder() {
    if (loading.value || older.value == null) return;
    const signal = controller.signal,
      before = older.value;
    loading.value = true;
    try {
      const page = await requests.groupMessages(id, { before }, { signal });
      if (signal.aborted) return;
      append(page.items);
      older.value = page.next != null && page.next < before ? page.next : null;
    } catch (error) {
      if (!signal.aborted) throw error;
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  }
  function catchUp(): Promise<void> {
    if (syncing) return syncing;
    if (!group.value || controller.signal.aborted) return Promise.resolve();
    const signal = controller.signal,
      gid = id,
      last = watermark;
    const task = (async () => {
      const record = await requests.groupGet(gid, { signal });
      let before: number | undefined;
      const fresh: GroupMessage[] = [];
      // Keep the watermark separate from local posts: a post may arrive before other peers' messages.
      for (;;) {
        const page = await requests.groupMessages(gid, { before }, { signal });
        if (signal.aborted) return;
        fresh.push(...page.items.filter((item) => item.seq > last));
        if (page.items.some((item) => item.seq <= last) || page.next == null) break;
        if (!page.items.length || (before != null && page.next >= before))
          throw new Error('Group pagination did not advance');
        before = page.next;
      }
      if (signal.aborted) return;
      group.value = record;
      append(fresh);
      watermark = fresh.reduce((max, item) => Math.max(max, item.seq), last);
    })();
    syncing = task;
    void task
      .finally(() => {
        if (syncing === task) syncing = undefined;
      })
      .catch(() => {});
    return task;
  }
  return { group, messages, older, loading, failed, open, readOlder, catchUp, append, stop };
}
