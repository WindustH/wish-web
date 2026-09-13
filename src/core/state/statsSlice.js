// One authoritative statistics snapshot. Refresh only while the page is open;
// leaving it invalidates pending responses and releases the interval.
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { shallowRef } from 'vue';
import * as api from '../api/endpoints.js';

export const stats = (() => {
  const status = shallowRef(null);
  const usage = shallowRef(null);
  const storage = shallowRef(null);
  const memory = shallowRef(null);
  const version = shallowRef(null);
  const loading = shallowRef(false);
  const error = shallowRef(null);
  const updatedAt = shallowRef(null);
  let epoch = 0;
  let pending = null;
  let controller = null;
  let autoTimer = null;

  function refresh() {
    if (pending) return pending;
    const own = epoch;
    controller = new AbortController();
    const options = { signal: controller.signal };
    loading.value = true;
    error.value = null;
    pending = Promise.all([
      api.daemonStatus(options), api.usageTotals(options), api.storageStatus(options), api.daemonVersion(options),
      api.runtimeMemory(options).catch(() => null),
    ]).then(([st, us, sg, ver, mem]) => {
      if (own !== epoch) return;
      status.value = st;
      usage.value = us;
      storage.value = sg;
      version.value = ver;
      memory.value = mem;
      updatedAt.value = Date.now();
    }).catch(cause => {
      if (own !== epoch) return;
      controller.abort();
      error.value = cause;
    }).finally(() => {
      if (own !== epoch) return;
      loading.value = false;
      pending = null;
      controller = null;
    });
    return pending;
  }

  function stopAuto() {
    clearInterval(autoTimer);
    autoTimer = null;
    epoch++;
    controller?.abort(); controller = null;
    pending = null;
    loading.value = false;
  }
  function startAuto() {
    stopAuto();
    void refresh();
    autoTimer = setInterval(refresh, cfg.stats.refreshMs);
  }
  bus.on('invalidate.daemon', () => { if (autoTimer !== null) void refresh(); });
  return { status, usage, storage, memory, version, loading, error, updatedAt, refresh, startAuto, stopAuto };
})();
