// Shared provider/model catalog reading (new session + model settings).
// Stale responses are generation-guarded; switching providers clears the
// old error and reloads; an error is never an empty list.
import { computed, ref, watch, onUnmounted } from 'vue';
import { configuredModels, readModels, readProviders, type ModelInfo, type ProviderInfo } from '../../core/provider-catalog';
export type { ModelInfo, ProviderInfo } from '../../core/provider-catalog';

export function useProviderModels(opts: { immediate?: boolean } = {}) {
  const { immediate = true } = opts;
  const providers = ref<ProviderInfo[] | null>(null);
  const models = ref<ModelInfo[] | null>(null);
  const providersErr = ref<any>(null);
  const modelsErr = ref<any>(null);

  // Independent generations per RESOURCE (root review): a shared counter
  // made retry() discard the provider response deterministically —
  // loadModels' ++gen invalidated the in-flight loadProviders capture and
  // the dialog was stuck on providers === null forever.
  let provGen = 0;
  let modelGen = 0;
  let alive = true;

  const loadProviders = async () => {
    const gen = ++provGen;
    try {
      const list = await readProviders();
      if (!alive || gen !== provGen) return;
      providers.value = list;
      providersErr.value = null;
    } catch (e) {
      if (!alive || gen !== provGen) return;
      providersErr.value = e;
    }
  };

  const selected = ref<string | null>(null);

  // Resolve models only after their provider configuration has loaded.
  const loadModels = async (providerId: string) => {
    if (providers.value == null) return;
    const gen = ++modelGen;
    models.value = null;
    modelsErr.value = null;
    try {
      const provider = providers.value.find(provider => provider.id === providerId);
      if (!provider) throw new Error(`Provider is no longer available: ${providerId}`);
      models.value = configuredModels(provider);
      const list = await readModels(provider);
      if (!alive || gen !== modelGen) return;
      models.value = list;
      modelsErr.value = null;
    } catch (e) {
      if (!alive || gen !== modelGen) return;
      modelsErr.value = e;          // failure ≠ empty list: error drives the UI
    }
  };

  // providers arrival (or a provider switch) resolves the catalog.
  watch([providers, selected], () => {
    if (!alive) return;
    if (providers.value == null || !selected.value) return;
    loadModels(selected.value);
  });

  if (immediate) loadProviders();   // app-resident consumers load on OPEN, not on mount

  onUnmounted(() => { alive = false; provGen++; modelGen++; });

  // "loading" only while it can still resolve — and a FAILED providers
  // read must END the spinner (the error UI takes over; no infinite wait).
  const loading = computed(() =>
    providersErr.value == null
    && (providers.value === null || (!!selected.value && models.value === null && modelsErr.value === null)));

  const loadErr = computed(() => providersErr.value ?? modelsErr.value);

  return {
    providers, models, loadErr, loading,
    selectProvider: (id: string) => {
      if (selected.value === id) return;
      modelGen++;
      selected.value = id;
      models.value = null;       // the previous provider's catalog is stale
      modelsErr.value = null;
    },
    retry: () => {
      modelGen++;
      providers.value = null;
      models.value = null;
      providersErr.value = null;
      modelsErr.value = null;
      loadProviders();           // the watch re-resolves models on arrival
    },
  };
}

/** Keep the current model selectable on its own provider's list. */
export function withCurrent(models: ModelInfo[] | null, currentId: string | null | undefined): ModelInfo[] {
  // While the catalog is still null (loading/failed), the CURRENT model
  // must remain visible/selectable — returning [] would blank the picker.
  if (!models) return currentId ? [{ id: currentId, source: 'current' }] : [];
  if (!currentId) return models;
  if (models.some((m) => m.id === currentId)) return models;
  return [{ id: currentId, source: 'current' }, ...models];
}
