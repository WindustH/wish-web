import { computed, onScopeDispose, ref } from 'vue';
import { configuredModels, readModels, readProviders, type ModelInfo, type ProviderInfo } from '../../core/provider-catalog';

export interface ModelGroup { provider: ProviderInfo; models: ModelInfo[]; loading: boolean; error?: unknown }
export function useModelCatalog() {
  const groups = ref<ModelGroup[]>([]);
  const loading = ref(false);
  const error = ref<unknown>();
  let controller = new AbortController();
  const pending = computed(() => loading.value || groups.value.some(group => group.loading));
  async function loadGroup(id: string, signal = controller.signal) {
    const group = groups.value.find(group => group.provider.id === id)!;
    group.loading = true;
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
    loading.value = true;
    error.value = undefined;
    groups.value = [];
    try {
      const providers = await readProviders(signal);
      if (signal.aborted) return;
      groups.value = providers.map(provider => ({ provider, models: configuredModels(provider), loading: true }));
      await Promise.all(groups.value.map(group => loadGroup(group.provider.id, signal)));
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
