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
  const version = shallowRef(null);
  const loading = shallowRef(false);
  const error = shallowRef(null);
  const updatedAt = shallowRef(null);
  let epoch = 0;
  let pending = null;
  let autoTimer = null;

  function refresh() {
    if (pending) return pending;
    const own = epoch;
    loading.value = true;
    error.value = null;
    pending = Promise.all([
      api.daemonStatus(), api.usageTotals(), api.storageStatus(), api.daemonVersion(),
    ]).then(([st, us, sg, ver]) => {
      if (own !== epoch) return;
      status.value = st;
      usage.value = us;
      storage.value = sg;
      version.value = ver;
      updatedAt.value = Date.now();
    }).catch(cause => {
      if (own === epoch) error.value = cause;
    }).finally(() => {
      if (own !== epoch) return;
      loading.value = false;
      pending = null;
    });
    return pending;
  }

  function stopAuto() {
    clearInterval(autoTimer);
    autoTimer = null;
    epoch++;
    pending = null;
    loading.value = false;
  }
  function startAuto() {
    stopAuto();
    void refresh();
    autoTimer = setInterval(refresh, cfg.stats.refreshMs);
  }
  bus.on('invalidate.daemon', () => { if (autoTimer !== null) void refresh(); });
  return { status, usage, storage, version, loading, error, updatedAt, refresh, startAuto, stopAuto };
})();
