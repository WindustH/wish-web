// Account readings for every enabled provider that has one set up. The last reading
// of each shows at once from the cache; fresh ones replace it as they arrive.
import { computed, onScopeDispose, ref, shallowRef } from 'vue';
import { providerAccount, providerConfigs } from '../../core/api/endpoints.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { peekCached, readCached, writeCached } from '../../core/util/responseCache.ts';
import type { AccountState } from './accountState.ts';

export interface AccountRow {
  id: string;
  brand?: string | null;
  state?: AccountState;
  /** When `state` was read, in ms. */
  checkedAt?: number;
  error?: string;
  loading: boolean;
}
interface CachedReading {
  state: AccountState;
  checkedAt: number;
}

const cacheKey = (id: string) => `account-state:${id}`;
const PROVIDERS_KEY = 'account-providers';
type ProviderSummary = { id: string; brand?: string | null; readable: boolean };

export function useAccountStates() {
  const rows = ref<AccountRow[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef('');
  let controller: AbortController | undefined;
  function cancel() {
    controller?.abort();
    controller = undefined;
    loading.value = false;
    for (const row of rows.value) row.loading = false;
  }
  onScopeDispose(cancel);

  function show(providers: ProviderSummary[]) {
    const previous = new Map(rows.value.map((row) => [row.id, row]));
    rows.value = providers
      .filter((item) => item.readable)
      .map((item) => {
        const cached = peekCached<CachedReading>(cacheKey(item.id));
        // Keep the last reading on screen; take names from the fresh list.
        return { ...cached, ...previous.get(item.id), id: item.id, brand: item.brand, loading: true, error: undefined };
      });
  }

  async function refresh() {
    controller?.abort();
    const own = (controller = new AbortController());
    loading.value = true;
    error.value = '';
    const cached = peekCached<ProviderSummary[]>(PROVIDERS_KEY) ?? (await readCached<ProviderSummary[]>(PROVIDERS_KEY));
    if (own.signal.aborted) return;
    if (cached && !rows.value.length) show(cached);
    for (const row of rows.value) {
      if (!row.state) {
        const reading = await readCached<CachedReading>(cacheKey(row.id));
        if (own.signal.aborted) return;
        if (reading) Object.assign(row, reading);
      }
    }
    try {
      const { providers } = await providerConfigs({ signal: own.signal });
      if (own.signal.aborted) return;
      const summary: ProviderSummary[] = providers
        .filter((item) => item.enabled)
        .map((item) => ({
          id: item.id,
          brand: item.brand,
          readable: !!item.account_state,
        }));
      writeCached(PROVIDERS_KEY, summary);
      show(summary);
    } catch (cause) {
      if (own.signal.aborted) return;
      error.value = describeError(cause).message;
      loading.value = false;
      for (const row of rows.value) row.loading = false;
      return;
    }
    await Promise.all(rows.value.map((row) => readRow(row, own.signal)));
    if (!own.signal.aborted) loading.value = false;
  }

  async function readRow(row: AccountRow, signal: AbortSignal) {
    row.loading = true;
    try {
      const state = (await providerAccount(row.id, { signal })) as AccountState;
      if (signal.aborted) return;
      const reading: CachedReading = { state, checkedAt: Date.now() };
      writeCached(cacheKey(row.id), reading);
      Object.assign(row, reading, { error: undefined });
    } catch (cause) {
      if (signal.aborted) return;
      row.error = describeError(cause).message;
    } finally {
      if (!signal.aborted) row.loading = false;
    }
  }
  function retry(id: string) {
    const row = rows.value.find((item) => item.id === id);
    if (!row || row.loading) return;
    controller ??= new AbortController();
    return readRow(row, controller.signal);
  }

  // When the freshest reading was taken, for the "updated" note.
  const checkedAt = computed(() => Math.max(0, ...rows.value.map((row) => row.checkedAt ?? 0)) || null);

  return { rows, loading, error, checkedAt, refresh, retry, cancel };
}
