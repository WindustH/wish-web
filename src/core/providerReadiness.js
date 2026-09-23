// Configuration readiness, not an assertion about upstream uptime or balance.
const present = value => typeof value === 'string' && value.trim().length > 0;
export function providerReady(provider, defaultModel) {
  if (!provider || provider.enabled === false || !present(provider.base_url) || !present(provider.path)) return false;
  const credential = name => present(provider.credentials?.[name]) || present(provider.credentials_env?.[name]);
  if (provider.auth === 'sig_v4') {
    if (!['region', 'access_key_id', 'secret_access_key'].every(credential)) return false;
  } else if (provider.auth !== 'none' && !present(provider.api_key) && !present(provider.api_key_env)) return false;
  return present(defaultModel) || Object.keys(provider.models ?? {}).some(present)
    || (present(provider.model_list) && present(provider.model_list_path));
}
export function hasReadyProvider(config) {
  return Object.entries(config.providers ?? {}).some(([id, provider]) =>
    providerReady(provider, config.defaults?.provider === id ? config.defaults.model : undefined));
}
