import { providerCatalogPages, providerConfigs, providerDraftCatalogPages } from './api/endpoints.ts';
import type { ProviderConfig } from './provider-presets.ts';

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
  brand?: string | null;
  account_state?: string | null;
  model_catalog_available: boolean;
  reasoning_efforts: Record<string, string | number>;
  models: Record<string, Omit<ModelInfo, 'id' | 'source'>>;
}

// Levels offered when neither a model nor its provider names any: four standard words most
// wires accept, with the last one (`max`) as the resolved default. A model that declares
// `supports_reasoning: false` never falls back here; 'none' stays a picker choice.
export const FALLBACK_EFFORT_LEVELS = ['low', 'medium', 'high', 'max'];
/** The reasoning efforts most providers take, weakest first. */
export const STANDARD_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

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

// Shared by the runtime picker and configuration editor.
export async function readCatalogModels(id: string, signal?: AbortSignal) {
  const models: any[] = [];
  for await (const page of providerCatalogPages(id, { signal })) models.push(...page.models);
  return models;
}

/** The catalog of a provider as a form holds it, before or without saving it. */
export async function readDraftCatalogModels(id: string, provider: ProviderConfig, signal?: AbortSignal) {
  const models: any[] = [];
  for await (const page of providerDraftCatalogPages(id, provider, { signal })) models.push(...page.models);
  return models;
}
