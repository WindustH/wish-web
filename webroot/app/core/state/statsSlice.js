// Stats slice: daemon status + usage + storage. Refreshed on demand and on
// sync invalidation while a stats view is on screen.
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { signal } from './reactive.js';
import * as api from '../api/endpoints.js';

export const stats = (() => {
  const status = signal(null);
  const usage = signal(null);
  const storage = signal(null);
  const version = signal(null);
  const loading = signal(false);
  const error = signal(null);
  const updatedAt = signal(null);

  async function refresh() {
    loading.value = true; error.value = null;
    try {
      const [st, us, sg, ver] = await Promise.all([
        api.daemonStatus().catch(() => null),
        api.usageTotals().catch(() => null),
        api.storageStatus().catch(() => null),
        api.daemonVersion().catch(() => null),
      ]);
      status.value = st; usage.value = us; storage.value = sg; version.value = ver;
      updatedAt.value = Date.now();
    } catch (err) {
      error.value = err;
    } finally { loading.value = false; }
  }

  let autoTimer = null;
  function startAuto() {
    stopAuto();
    refresh();
    autoTimer = setInterval(refresh, cfg.stats.refreshMs);
  }
  function stopAuto() { clearInterval(autoTimer); autoTimer = null; }

  bus.on('invalidate.daemon', () => {
    if (autoTimer) api.daemonStatus().then((st) => { status.value = st; }).catch(() => {});
  });

  return { status, usage, storage, version, loading, error, updatedAt, refresh, startAuto, stopAuto };
})();
