import { shallowRef } from 'vue';
import { peekCached, readCached, writeCached } from '../util/responseCache.ts';

/**
 * One owned read: a cancelled or older response cannot replace the current scope.
 * With `cache`, a read first shows the last response for the same query, then
 * replaces it when the fresh one arrives.
 */
export function createUsageResource<T, Q>(read: (query: Q, signal: AbortSignal) => Promise<T>, cache?: (query: Q) => { key: string; persist: boolean } | null) {
  const data = shallowRef<T | null>(null);
  const error = shallowRef('');
  const loading = shallowRef(false);
  let controller: AbortController | undefined;
  let generation = 0;
  function cancel() { generation++; controller?.abort(); controller = undefined; loading.value = false; }
  function reset() { cancel(); data.value = null; error.value = ''; }
  async function load(query: Q, clear = false) {
    cancel();
    const mine = generation;
    controller = new AbortController();
    loading.value = true;
    error.value = '';
    const cached = cache?.(query);
    const hit = cached ? peekCached<T>(cached.key) : undefined;
    if (hit !== undefined) data.value = hit;
    else if (clear) data.value = null;
    // After a reload the memory is empty; IndexedDB may still answer before the network.
    if (cached && hit === undefined) void readCached<T>(cached.key).then(value => { if (value !== undefined && mine === generation && loading.value) data.value = value; });
    try {
      const result = await read(query, controller.signal);
      if (mine === generation) {
        data.value = result;
        if (cached) writeCached(cached.key, result, { persist: cached.persist });
      }
    } catch (cause) {
      if (mine === generation) error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (mine === generation) { loading.value = false; controller = undefined; }
    }
  }
  return { data, error, loading, load, cancel, reset };
}
