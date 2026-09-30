import { shallowRef, watch, type Ref } from 'vue';

/**
 * What the server knows of configured items - search providers, MCP servers - by id. It is read
 * at once and again after every save, since a save may change what works; `refresh` reads it on
 * demand. What is known of the items is extra: when it cannot be read the configuration still
 * edits, and the last reading stays.
 */
export function useStatuses<Reply, Status extends { id: string }>(read: () => Promise<Reply>, list: (reply: Reply) => Status[], revision: Ref<string>) {
  const reply = shallowRef<Reply>();
  const statuses = shallowRef<Record<string, Status>>({});
  async function refresh() {
    try {
      const value = await read();
      reply.value = value;
      statuses.value = Object.fromEntries(list(value).map(status => [status.id, status]));
    } catch { /* see above */ }
  }
  watch(revision, refresh, { immediate: true });
  return { reply, statuses, refresh };
}
