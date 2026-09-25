import { computed, onScopeDispose, ref } from 'vue';
import { configuredModels, readModels, readProviders, type ModelInfo, type ProviderInfo } from '../../core/provider-catalog.ts';
import { peekCached, readCached, writeCached } from '../../core/util/responseCache.ts';

export interface ModelGroup { provider: ProviderInfo; models: ModelInfo[]; loading: boolean; error?: unknown }
type Snapshot = { provider: ProviderInfo; models: ModelInfo[] }[];
const CACHE_KEY = 'model-catalog';
const restore = (snapshot: Snapshot): ModelGroup[] => snapshot.map(({ provider, models }) => ({ provider, models, loading: false }));

// The picker opens with the last catalog and replaces it as fresh lists arrive;
// only a first-ever open (nothing cached) waits on the network.
export function useModelCatalog() {
  const groups = ref<ModelGroup[]>([]);
  const loading = ref(false);
  const error = ref<unknown>();
  let controller = new AbortController();
  const pending = computed(() => loading.value || groups.value.some(group => group.loading));
  async function loadGroup(id: string, signal = controller.signal, quiet = false) {
    const group = groups.value.find(group => group.provider.id === id)!;
    if (!quiet) group.loading = true;
    group.error = undefined;
    try {
      const models = await readModels(group.provider, signal);
      if (!signal.aborted) group.models = models;
    } catch (cause) {
      if (!signal.aborted) group.error = cause;
    } finally {
      if (!signal.aborted) group.loading = false;
    }
  }
  async function reload() {
    controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    error.value = undefined;
    const cached = peekCached<Snapshot>(CACHE_KEY);
    groups.value = cached ? restore(cached) : [];
    loading.value = !cached;
    if (!cached) void readCached<Snapshot>(CACHE_KEY).then(snapshot => {
      if (snapshot && !signal.aborted && loading.value) { groups.value = restore(snapshot); loading.value = false; }
    });
    try {
      const providers = await readProviders(signal);
      if (signal.aborted) return;
      const shown = new Map(groups.value.map(group => [group.provider.id, group]));
      groups.value = providers.map(provider => {
        const previous = shown.get(provider.id);
        return { provider, models: previous?.models ?? configuredModels(provider), loading: !previous };
      });
      loading.value = false;
      await Promise.all(groups.value.map(group => loadGroup(group.provider.id, signal, shown.has(group.provider.id))));
      if (!signal.aborted && !groups.value.some(group => group.error)) {
        writeCached(CACHE_KEY, JSON.parse(JSON.stringify(groups.value.map(({ provider, models }) => ({ provider, models })))));
      }
    } catch (cause) {
      if (!signal.aborted) error.value = cause;
    } finally {
      if (!signal.aborted) loading.value = false;
    }
  }
  void reload();
  onScopeDispose(() => controller.abort());
  return { groups, pending, error, reload, loadGroup };
}
