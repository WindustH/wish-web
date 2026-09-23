// Serialize reads per key and coalesce events received during a read into one
// trailing read. Invalidations suppress both stale data and stale errors.
export function createKeyedRefresh(read, accept, reject) {
  const jobs = new Map();
  function invalidate(key) {
    const job = jobs.get(key);
    jobs.delete(key);
    job?.controller.abort();
  }
  async function refresh(key) {
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
