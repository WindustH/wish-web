// One authoritative statistics snapshot. Refresh only while the page is open;
// leaving it invalidates pending responses and releases the interval.
import { cfg } from '../config.ts';
import { shallowRef } from 'vue';
import * as api from '../api/endpoints.ts';
import { peekCached, readCached, writeCached } from '../util/responseCache.ts';
import { rangeBounds, type TotalsRange } from '../usage/windows.ts';
import type { StatusSnapshot, StorageSnapshot, UsageSnapshot } from '../api/endpoints.ts';
export type { StatusSnapshot, StorageSnapshot, UsageSnapshot, UsageTotals } from '../api/endpoints.ts';

export interface VersionSnapshot { name: string; version: string }
// The persisted statistics snapshot; `usageKey` names the window its usage covers.
export interface StatsSnapshot {
  status: StatusSnapshot;
  usage: UsageSnapshot;
  usageKey: string;
  storage: StorageSnapshot;
  version: VersionSnapshot;
  updatedAt: number;
}

export const stats = (() => {
  const status = shallowRef<StatusSnapshot | null>(null);
  const usage = shallowRef<UsageSnapshot | null>(null);
  const storage = shallowRef<StorageSnapshot | null>(null);
  const version = shallowRef<VersionSnapshot | null>(null);
  const loading = shallowRef(false);
  const error = shallowRef<unknown>(null);
  const updatedAt = shallowRef<number | null>(null);
  // Usage totals follow a chosen window; the other figures are always current.
  const usageRange = shallowRef<TotalsRange>({ period: 'all' });
  const usageSwitching = shallowRef(false);
  const usageKey = (range: TotalsRange) => `stats-usage:${JSON.stringify(range)}`;
  let usageController: AbortController | null = null;
  let epoch = 0;
  let pending: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let autoTimer: ReturnType<typeof setInterval> | undefined;

  function apply(snapshot: StatsSnapshot) {
    status.value = snapshot.status;
    if (snapshot.usageKey === usageKey(usageRange.value)) usage.value = snapshot.usage;
    storage.value = snapshot.storage;
    version.value = snapshot.version;
    updatedAt.value = snapshot.updatedAt;
  }

  function refresh(): Promise<void> {
    if (pending) return pending;
    const own = epoch;
    // After a reload, show the last snapshot (with its own time) until this read lands.
    if (updatedAt.value == null) void readCached<StatsSnapshot>('stats-snapshot').then(snapshot => { if (snapshot && own === epoch && updatedAt.value == null) apply(snapshot); });
    controller = new AbortController();
    const options = { signal: controller.signal };
    loading.value = true;
    error.value = null;
    const range = usageRange.value;
    pending = Promise.all([
      api.daemonStatus(options), api.usageTotals({ ...options, query: rangeBounds(range) }), api.storageStatus(options), api.daemonVersion(options),
    ]).then(([st, us, sg, ver]) => {
      if (own !== epoch) return;
      // A range switched meanwhile has its own read; these totals are for the old one.
      const snapshot: StatsSnapshot = { status: st, usage: us, usageKey: usageKey(range), storage: sg, version: ver, updatedAt: Date.now() };
      apply(snapshot);
      writeCached('stats-snapshot', snapshot);
      writeCached(usageKey(range), us);
    }).catch(cause => {
      if (own !== epoch) return;
      controller!.abort();
      error.value = cause;
    }).finally(() => {
      if (own !== epoch) return;
      loading.value = false;
      pending = null;
      controller = null;
    });
    return pending;
  }

  // Show the last totals for the new window at once, then replace them.
  function setUsageRange(range: TotalsRange) {
    const key = usageKey(range);
    if (key === usageKey(usageRange.value)) return;
    usageRange.value = range;
    usageSwitching.value = true;
    const hit = peekCached<UsageSnapshot>(key);
    if (hit) usage.value = hit;
    else void readCached<UsageSnapshot>(key).then(value => { if (value && usageRange.value === range && usageSwitching.value) usage.value = value; });
    usageController?.abort();
    const controller = usageController = new AbortController();
    api.usageTotals({ signal: controller.signal, query: rangeBounds(range) }).then(result => {
      if (usageRange.value !== range) return;
      usage.value = result;
      writeCached(key, result);
    }).catch(() => {}).finally(() => { if (usageRange.value === range) usageSwitching.value = false; });
  }

  function stopAuto() {
    clearInterval(autoTimer);
    autoTimer = undefined;
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
  return { status, usage, usageRange, usageSwitching, storage, version, loading, error, updatedAt, refresh, setUsageRange, startAuto, stopAuto };
})();
