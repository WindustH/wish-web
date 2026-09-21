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
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await providerModels(provider.id, { signal, query: { cursor } });
    for (const model of page.models) {
      if (model.allowed_for_provider) models.set(model.id, { ...model, ...provider.models[model.id], source: 'catalog' });
    }
    cursor = page.next_cursor;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error(`Model catalog repeated a cursor: ${provider.id}`);
      cursors.add(cursor);
    }
  } while (cursor);
  return [...models.values()];
}
