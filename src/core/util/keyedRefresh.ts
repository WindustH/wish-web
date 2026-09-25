// Serialize reads per key and coalesce events received during a read into one
// trailing read. Invalidations suppress both stale data and stale errors.
export function createKeyedRefresh<K, V>(
  read: (key: K, signal: AbortSignal) => Promise<V>,
  accept: (key: K, value: V) => void,
  reject: (key: K, error: unknown) => void,
) {
  const jobs = new Map<K, { controller: AbortController; again: boolean }>();
  function invalidate(key: K) {
    const job = jobs.get(key);
    jobs.delete(key);
    job?.controller.abort();
  }
  async function refresh(key: K) {
    const pending = jobs.get(key);
    if (pending) { pending.again = true; return; }
    const job = { controller: new AbortController(), again: false };
    jobs.set(key, job);
    try {
      do {
        job.again = false;
        try {
          const value = await read(key, job.controller.signal);
          if (jobs.get(key) === job) accept(key, value);
        } catch (error) {
          if (jobs.get(key) === job && !job.again) reject(key, error);
        }
      } while (jobs.get(key) === job && job.again);
    } finally {
      if (jobs.get(key) === job) jobs.delete(key);
    }
  }
  function clear() { for (const key of jobs.keys()) invalidate(key); }
  return { refresh, invalidate, clear };
}
