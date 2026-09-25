import { providerConfigs, providerModels } from './api/endpoints.js';

export interface ModelInfo {
  id: string;
  display_name?: string;
  description?: string;
  source?: 'configured' | 'catalog' | 'current';
  input_modalities?: string[] | null;
  supports_reasoning?: boolean;
  default_reasoning_effort?: string;
  reasoning_efforts?: Record<string, string | number>;
  /** Configured window, preferred over the upstream catalog's `context_window`. */
  context_window_tokens?: number | null;
  context_window?: number | null;
}
export interface ProviderInfo {
  display_name?: string | null;
  id: string;
  preset: string;
  enabled: boolean;
  model_catalog_available: boolean;
  reasoning_efforts: Record<string, string | number>;
  reasoning_efforts_source: string;
  models: Record<string, Omit<ModelInfo, 'id' | 'source'>>;
}

// Levels offered when neither a model nor its provider names any: four standard words most
// wires accept, with the last one (`max`) as the resolved default. A model that declares
// `supports_reasoning: false` never falls back here; 'none' stays a picker choice.
export const FALLBACK_EFFORT_LEVELS = ['low', 'medium', 'high', 'max'];

export async function readProviders(signal?: AbortSignal): Promise<ProviderInfo[]> {
  const response = await providerConfigs({ signal });
  return response.providers.filter((provider: ProviderInfo) => provider.enabled);
}

export const configuredModels = (provider: ProviderInfo): ModelInfo[] => Object.entries(provider.models).map(([id, metadata]) => ({ ...metadata, id, source: 'configured' }));

export async function readModels(provider: ProviderInfo, signal?: AbortSignal): Promise<ModelInfo[]> {
  const configured = configuredModels(provider);
  // Model overrides are not an allowlist; the runtime owns catalog support.
  if (!provider.model_catalog_available) return configured;
  const models = new Map(configured.map(model => [model.id, model]));
  for (const model of await readCatalogModels(provider.id, signal)) {
    if (model.allowed_for_provider) models.set(model.id, { ...model, ...provider.models[model.id], source: 'catalog' });
  }
  return [...models.values()];
}

// Shared by the runtime picker and configuration editor. A malformed upstream
// cursor must not keep either UI in an endless request loop.
export async function readCatalogModels(id: string, signal?: AbortSignal) {
  const models: any[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    signal?.throwIfAborted();
    const page = await providerModels(id, { signal, query: { cursor } });
    models.push(...page.models);
    cursor = page.next_cursor;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error(`Model catalog repeated a cursor: ${id}`);
      cursors.add(cursor);
    }
  } while (cursor);
  return models;
}
