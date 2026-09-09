// Shared provider/model catalog reading (new session + model settings).
// Stale responses are generation-guarded; switching providers clears the
// old error and reloads; an error is never an empty list.
import { computed, ref, watch, onUnmounted } from 'vue';
import { providerConfigs, providerModels } from '../../core/api/endpoints.js';

export interface ProviderInfo {
  id: string; enabled: boolean; models?: Record<string, unknown>;
  has_api_key?: boolean; [k: string]: unknown;
}
export interface ModelInfo { id: string; source?: 'configured' | 'catalog' | 'current' }

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
      const res = await providerConfigs();
      if (!alive || gen !== provGen) return;
      // Disabled providers are never offered (old models.js semantics).
      providers.value = (res.providers ?? []).filter((p: ProviderInfo) => p.enabled !== false);
      providersErr.value = null;
    } catch (e) {
      if (!alive || gen !== provGen) return;
      providersErr.value = e;
    }
  };

  const selected = ref<string | null>(null);

  // Model resolution WAITS for a successful providers read (root review):
  // retry() resets providers to null and only reloads THEM — resolving
  // models in parallel would look up an empty provider list, miss the
  // explicitly configured models and fall through to the remote catalog.
  const loadModels = async (providerId: string) => {
    if (providers.value == null) return;
    const gen = ++modelGen;
    // Explicitly CONFIGURED models win and the remote catalog is never
    // contacted for them (old models.js): a provider whose registry catalog
    // is unavailable (e.g. 501) still offers exactly what the user pinned
    // in the config. Only unconfigured providers fall through to the
    // catalog read, filtered by allowed_for_provider.
    const cfgp = (providers.value || []).find((p) => p.id === providerId);
    const explicit = Object.keys((cfgp?.models as Record<string, unknown>) || {});
    if (explicit.length) {
      models.value = explicit.map((id) => ({ id, source: 'configured' as const }));
      modelsErr.value = null;
      return;
    }
    models.value = null;
    try {
      const res = await providerModels(providerId);
      if (!alive || gen !== modelGen) return;
      models.value = (res.models ?? [])
        .filter((m: any) => m.allowed_for_provider !== false)
        .map((m: any) => ({ id: m.id ?? m, source: 'catalog' as const }));
      modelsErr.value = null;
    } catch (e) {
      if (!alive || gen !== modelGen) return;
      models.value = [];
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
