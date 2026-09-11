import { shallowRef } from 'vue';

/** One owned read: a cancelled or older response cannot replace the current scope. */
export function createUsageResource<T, Q>(read: (query: Q, signal: AbortSignal) => Promise<T>) {
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
    if (clear) data.value = null;
    try {
      const result = await read(query, controller.signal);
      if (mine === generation) data.value = result;
    } catch (cause) {
      if (mine === generation) error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (mine === generation) { loading.value = false; controller = undefined; }
    }
  }
  return { data, error, loading, load, cancel, reset };
}
