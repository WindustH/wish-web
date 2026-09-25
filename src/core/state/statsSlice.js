// One authoritative statistics snapshot. Refresh only while the page is open;
// leaving it invalidates pending responses and releases the interval.
import { cfg } from '../config.js';
import { shallowRef } from 'vue';
import * as api from '../api/endpoints.js';
import { readCached, writeCached } from '../util/responseCache';

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
  let controller = null;
  let autoTimer = null;

  function apply(snapshot) {
    status.value = snapshot.status;
    usage.value = snapshot.usage;
    storage.value = snapshot.storage;
    version.value = snapshot.version;
    updatedAt.value = snapshot.updatedAt;
  }

  function refresh() {
    if (pending) return pending;
    const own = epoch;
    // After a reload, show the last snapshot (with its own time) until this read lands.
    if (updatedAt.value == null) void readCached('stats-snapshot').then(snapshot => { if (snapshot && own === epoch && updatedAt.value == null) apply(snapshot); });
    controller = new AbortController();
    const options = { signal: controller.signal };
    loading.value = true;
    error.value = null;
    pending = Promise.all([
      api.daemonStatus(options), api.usageTotals(options), api.storageStatus(options), api.daemonVersion(options),
    ]).then(([st, us, sg, ver]) => {
      if (own !== epoch) return;
      const snapshot = { status: st, usage: us, storage: sg, version: ver, updatedAt: Date.now() };
      apply(snapshot);
      writeCached('stats-snapshot', snapshot);
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
  return { status, usage, storage, version, loading, error, updatedAt, refresh, startAuto, stopAuto };
})();
