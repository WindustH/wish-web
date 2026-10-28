import { ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue';

/**
 * What the server knows of configured items - search providers, MCP servers - by id. It is read
 * at once and again after every save, since a save may change what works; `refresh` reads it on
 * demand. What is known of the items is extra: when it cannot be read the configuration still
 * edits, and the last reading stays.
 */
export function useStatuses<Reply, Status extends { id: string }>(
  read: () => Promise<Reply>,
  list: (reply: Reply) => Status[],
  revision: Ref<string>,
) {
  const reply = shallowRef<Reply>();
  const statuses = shallowRef<Record<string, Status>>({});
  // Whether what is known is current: before the first reading, after one that failed, and from a
  // save until the reading after it, an item's state is unknown - not "never checked", nor "not
  // saved" for one just saved.
  const known = ref(false);
  let generation = 0;
  onScopeDispose(() => {
    generation++;
  });
  async function refresh() {
    const own = ++generation;
    try {
      const value = await read();
      if (own !== generation) return;
      reply.value = value;
      statuses.value = Object.fromEntries(list(value).map((status) => [status.id, status]));
      known.value = true;
    } catch {
      /* see above */
    }
  }
  watch(
    revision,
    () => {
      known.value = false;
      void refresh();
    },
    { immediate: true },
  );
  return { reply, statuses, known, refresh };
}
