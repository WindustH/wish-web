import { ref, shallowRef, watch, type Ref } from 'vue';

/**
 * What the server knows of configured items - search providers, MCP servers - by id. It is read
 * at once and again after every save, since a save may change what works; `refresh` reads it on
 * demand. What is known of the items is extra: when it cannot be read the configuration still
 * edits, and the last reading stays.
 */
export function useStatuses<Reply, Status extends { id: string }>(read: () => Promise<Reply>, list: (reply: Reply) => Status[], revision: Ref<string>) {
  const reply = shallowRef<Reply>();
  const statuses = shallowRef<Record<string, Status>>({});
  // Whether there has been a reading: before it, an item's state is unknown, not "never checked".
  const known = ref(false);
  async function refresh() {
    try {
      const value = await read();
      reply.value = value;
      statuses.value = Object.fromEntries(list(value).map(status => [status.id, status]));
    } catch { /* see above */ } finally {
      known.value = true;
    }
  }
  watch(revision, refresh, { immediate: true });
  return { reply, statuses, known, refresh };
}
