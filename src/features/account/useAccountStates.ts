// Account readings for every enabled provider that has one set up. The last reading
// of each shows at once from the cache; fresh ones replace it as they arrive.
import { onScopeDispose, ref, shallowRef } from 'vue';
import { providerAccount, providerConfigs } from '../../core/api/endpoints.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { peekCached, readCached, writeCached } from '../../core/util/responseCache.ts';
import type { AccountState } from './accountState.ts';

export interface AccountRow {
  id: string;
  /** The configured display name, if any; otherwise the preset's brand names it. */
  name?: string | null;
  preset?: string;
  brand?: string | null;
  state?: AccountState;
  /** When `state` was read, in ms. */
  checkedAt?: number;
  error?: string;
  loading: boolean;
}
interface CachedReading { state: AccountState; checkedAt: number }

const cacheKey = (id: string) => `account-state:${id}`;
const PROVIDERS_KEY = 'account-providers';
type ProviderSummary = { id: string; name?: string | null; preset?: string; brand?: string | null; readable: boolean };

export function useAccountStates() {
  const rows = ref<AccountRow[]>([]);
  // Enabled providers without an account reading.
  const unconfigured = ref<ProviderSummary[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef('');
  let controller: AbortController | undefined;
  onScopeDispose(() => controller?.abort());

  function show(providers: ProviderSummary[]) {
    const previous = new Map(rows.value.map(row => [row.id, row]));
    rows.value = providers.filter(item => item.readable).map(item => {
      const cached = peekCached<CachedReading>(cacheKey(item.id));
      // Keep the last reading on screen; take names from the fresh list.
      return { ...cached, ...previous.get(item.id), id: item.id, name: item.name, preset: item.preset, brand: item.brand, loading: true, error: undefined };
    });
    unconfigured.value = providers.filter(item => !item.readable);
  }

  async function refresh() {
    controller?.abort();
    const own = controller = new AbortController();
    loading.value = true;
    error.value = '';
    const cached = peekCached<ProviderSummary[]>(PROVIDERS_KEY) ?? await readCached<ProviderSummary[]>(PROVIDERS_KEY);
    if (cached && !rows.value.length) show(cached);
    for (const row of rows.value) {
      if (!row.state) {
        const reading = await readCached<CachedReading>(cacheKey(row.id));
        if (reading) Object.assign(row, reading);
      }
    }
    try {
      const { providers } = await providerConfigs({ signal: own.signal });
      const summary: ProviderSummary[] = providers.filter(item => item.enabled).map(item => ({
        id: item.id, name: item.display_name, preset: item.preset, brand: item.brand, readable: !!item.account_state,
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
    await Promise.all(rows.value.map(async row => {
      try {
        const state = await providerAccount(row.id, { signal: own.signal }) as AccountState;
        if (own.signal.aborted) return;
        const reading: CachedReading = { state, checkedAt: Date.now() };
        writeCached(cacheKey(row.id), reading);
        Object.assign(row, reading, { error: undefined });
      } catch (cause) {
        if (own.signal.aborted) return;
        row.error = describeError(cause).message;
      } finally {
        if (!own.signal.aborted) row.loading = false;
      }
    }));
    if (!own.signal.aborted) loading.value = false;
  }

  return { rows, unconfigured, loading, error, refresh };
}
