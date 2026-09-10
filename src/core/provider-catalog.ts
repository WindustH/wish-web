import { providerConfigs, providerModels, providerSummaries } from './api/endpoints.js';

export interface ModelInfo {
  id: string;
  display_name?: string;
  description?: string;
  source?: 'configured' | 'catalog' | 'current';
  supports_reasoning?: boolean;
  default_reasoning_effort?: string;
  reasoning_efforts?: Record<string, string | number>;
}
export interface ProviderInfo {
  id: string;
  preset: string;
  enabled: boolean;
  allow_any_model: boolean;
  model_catalog_available: boolean;
  reasoning_efforts: Record<string, string | number>;
  reasoning_efforts_source: string;
  models: Record<string, Omit<ModelInfo, 'id' | 'source'>>;
}

export async function readProviders(signal?: AbortSignal): Promise<ProviderInfo[]> {
  const [response, runtime] = await Promise.all([providerConfigs({ signal }), providerSummaries({ signal })]);
  const summaries = new Map<string, Pick<ProviderInfo, 'model_catalog_available' | 'reasoning_efforts' | 'reasoning_efforts_source'>>(runtime.providers.map((provider: { id: string; model_catalog_available: boolean }) => [provider.id, provider]));
  return response.providers.filter((provider: ProviderInfo) => provider.enabled).map((provider: ProviderInfo) => {
    const summary = summaries.get(provider.id);
    if (!summary) throw new Error(`Provider configuration is not active: ${provider.id}`);
    return { ...provider, ...summary };
  });
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
