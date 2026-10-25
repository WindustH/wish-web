// Configuration readiness, not an assertion about upstream uptime or balance.
// The provider settings readiness reads; secrets may be redacted or null.
export interface ProviderSettings {
  credential_id?: string | null;
  enabled?: boolean;
  base_url?: string | null;
  path?: string | null;
  auth?: string;
  api_key?: string | null;
  api_key_env?: string | null;
  credentials?: Record<string, string | null | undefined> | null;
  credentials_env?: Record<string, string | null | undefined> | null;
  models?: Record<string, unknown> | null;
  model_list?: string | null;
  model_list_path?: string | null;
}
const present = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
export function providerReady(provider: ProviderSettings | null | undefined, defaultModel?: string | null) {
  if (!provider || provider.enabled === false || !present(provider.base_url) || !present(provider.path)) return false;
  const credential = (name: string) => present(provider.credentials?.[name]) || present(provider.credentials_env?.[name]);
  if (provider.credential_id) { /* Account material is resolved by the server. */ } else if (provider.auth === 'sig_v4') {
    if (!['region', 'access_key_id', 'secret_access_key'].every(credential)) return false;
  } else if (provider.auth !== 'none' && !present(provider.api_key) && !present(provider.api_key_env)) return false;
  return present(defaultModel) || Object.keys(provider.models ?? {}).some(present)
    || (present(provider.model_list) && present(provider.model_list_path));
}
export function hasReadyProvider(config: { accounts?: Record<string, Partial<ProviderSettings>> | null; providers?: Record<string, ProviderSettings> | null; defaults?: { provider?: string | null; model?: string | null } | null }) {
  return Object.entries(config.providers ?? {}).some(([id, provider]) => {
    const account = provider.credential_id ? config.accounts?.[provider.credential_id] : undefined;
    if (provider.credential_id && !account) return false;
    const resolved = account ? { ...provider, ...account, credential_id: null } : provider;
    return providerReady(resolved, config.defaults?.provider === id ? config.defaults.model : undefined);
  });
}
