// Shared provider/model catalog reading (new session + model settings).
// Stale responses are generation-guarded; switching providers clears the
// old error and reloads; an error is never an empty list.
import { computed, ref, watch, onUnmounted } from 'vue';
import { providerConfigs, providerModels } from '../../core/api/endpoints.js';

export interface ProviderInfo {
  id: string; enabled: boolean; models?: Record<string, unknown>;
  has_api_key?: boolean; [k: string]: unknown;
}
export interface ModelInfo { id: string; source?: string }

export function useProviderModels() {
  const providers = ref<ProviderInfo[] | null>(null);
  const models = ref<ModelInfo[] | null>(null);
  const loadErr = ref<any>(null);
  const reloadKey = ref(0);

  let providerGen = 0;
  let providersAlive = true;

  const reload = () => {
    providers.value = null;
    models.value = null;
    loadErr.value = null;
    reloadKey.value++;
  };

  const loadProviders = async () => {
    const gen = providerGen;
    try {
      const res = await providerConfigs();
      if (!providersAlive || gen !== providerGen) return;
      providers.value = res.providers ?? [];
      loadErr.value = null;
    } catch (e) {
      if (!providersAlive || gen !== providerGen) return;
      loadErr.value = e;
    }
  };

  const selected = ref<string | null>(null);

  const loadModels = async (providerId: string) => {
    const gen = ++providerGen;
    try {
      const res = await providerModels(providerId);
      if (!providersAlive || gen !== providerGen) return;
      models.value = (res.models ?? []).map((m: any) => ({ id: m.id ?? m }));
      loadErr.value = null;
    } catch (e) {
      if (!providersAlive || gen !== providerGen) return;
      models.value = null;
      loadErr.value = e;
    }
  };

  loadProviders();

  onUnmounted(() => { providersAlive = false; providerGen++; });

  const loading = computed(() =>
    providers.value === null || (models.value === null && loadErr.value === null));

  return {
    providers, models, loadErr, loading,
    selectProvider: (id: string) => { selected.value = id; models.value = null; loadErr.value = null; loadModels(id); },
    retry: () => { reload(); loadProviders(); if (selected.value) loadModels(selected.value); },
    _reloadKey: reloadKey,
  };
}

/** Keep the current model selectable on its own provider's list. */
export function withCurrent(models: ModelInfo[] | null, currentId: string | null | undefined): ModelInfo[] {
  if (!models) return [];
  if (!currentId) return models;
  if (models.some((m) => m.id === currentId)) return models;
  return [{ id: currentId, source: 'current' }, ...models];
}
