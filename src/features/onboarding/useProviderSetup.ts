import { computed, onScopeDispose, ref, shallowRef } from 'vue';
import { get, put } from '../../core/api/client.js';
import type { ConfigCatalog, ProviderConfig } from '../../core/provider-presets';
import { errorText } from '../../core/config-editor';
import { providerReady } from '../../core/providerReadiness.js';
import { tr } from '../../core/i18n/tr';
import { showError } from '../../ui/errorDialog';

const customProvider = (): ProviderConfig => ({ enabled: true, protocol: 'openai_chat',
  base_url: '', path: '/v1/chat/completions', auth: 'bearer', models: {},
  credentials: {}, credentials_env: {}, headers: {}, proxy_enabled: true });
export function useProviderSetup() {
  const snapshot = shallowRef<any>();
  const catalog = shallowRef<ConfigCatalog>({ presets: [] });
  const loading = ref(true), saving = ref(false), error = ref('');
  const choice = ref('custom'), id = ref('custom'), model = ref('');
  const provider = ref<ProviderConfig>(customProvider());
  const preset = computed(() => catalog.value.presets.find(item => item.id === provider.value.preset));
  let controller: AbortController | undefined;
  let generation = 0;
  function choose(value: string) {
    choice.value = value;
    const existing = value.startsWith('existing:') ? value.slice(9) : undefined;
    const selected = catalog.value.presets.find(item => `preset:${item.id}` === value);
    provider.value = structuredClone(existing ? snapshot.value.config.providers[existing]
      : selected ? selected.variants[selected.protocols[0]!] : customProvider());
    provider.value.enabled = true;
    provider.value.models ??= {};
    provider.value.credentials ??= {};
    provider.value.credentials_env ??= {};
    id.value = existing ?? selected?.id ?? 'custom';
    if (!existing) {
      const base = id.value;
      let suffix = 2;
      while (snapshot.value.config.providers[id.value]) id.value = `${base}-${suffix++}`;
    }
    model.value = existing === snapshot.value.config.defaults.provider
      ? snapshot.value.config.defaults.model : Object.keys(provider.value.models)[0] ?? '';
    error.value = '';
  }
  async function load() {
    controller?.abort(); controller = new AbortController();
    const own = ++generation;
    loading.value = true; error.value = '';
    try {
      const [config, presets] = await Promise.allSettled([
        get('/config', { signal: controller.signal }), get('/provider-presets', { signal: controller.signal }),
      ]);
      if (own !== generation) return;
      if (config.status === 'rejected') throw config.reason;
      snapshot.value = config.value;
      catalog.value = presets.status === 'fulfilled' ? presets.value : { presets: [] };
      const existing = Object.keys(config.value.config.providers)[0];
      choose(existing ? `existing:${existing}` : 'custom');
    } catch (cause) { if (own === generation) error.value = errorText(cause); }
    finally { if (own === generation) loading.value = false; }
  }
  function setSecret(value: string, field?: string) {
    const env = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value)?.[1];
    if (field) {
      delete provider.value.credentials[field]; delete provider.value.credentials_env[field];
      if (env) provider.value.credentials_env[field] = env;
      else if (value) provider.value.credentials[field] = value;
    } else { provider.value.api_key_env = env ?? null; provider.value.api_key = env ? null : value || null; }
  }
  function secretValue(field?: string) {
    const env = field ? provider.value.credentials_env[field] : provider.value.api_key_env;
    const raw = field ? provider.value.credentials[field] : provider.value.api_key;
    return env ? '${' + env + '}' : raw === '<redacted>' ? '' : raw ?? '';
  }
  async function save() {
    if (!snapshot.value || saving.value) return false;
    error.value = '';
    const name = id.value.trim(), selectedModel = model.value.trim();
    try {
      if (!name || !selectedModel) throw new Error(tr('请填写提供商 ID 和模型 ID。', 'Enter a provider ID and model ID.'));
      const current = JSON.parse(JSON.stringify(provider.value));
      current.base_url = current.base_url.trim(); current.path = current.path.trim();
      const url = new URL(current.base_url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error(tr('地址必须使用 HTTP 或 HTTPS。', 'Use an HTTP or HTTPS address.'));
      if (!providerReady(current, selectedModel)) throw new Error(tr('请填写完整的连接地址和认证信息。', 'Complete the connection and credentials.'));
      for (const field of preset.value?.required_credentials ?? []) {
        if (!current.credentials[field]?.trim() && !current.credentials_env[field]?.trim()) throw new Error(tr('缺少凭据：', 'Missing credential: ') + field);
      }
      if (name in snapshot.value.config.providers && choice.value !== `existing:${name}`) throw new Error(tr('提供商 ID 已存在。', 'Provider ID already exists.'));
      const config = structuredClone(snapshot.value.config);
      current.models[selectedModel] ??= {};
      config.providers[name] = current;
      config.defaults.provider = name; config.defaults.model = selectedModel;
      config.defaults.reasoning = { ...config.defaults.reasoning, effort: null };
      saving.value = true;
      const saved = await put('/config', { revision: snapshot.value.revision, config }, { signal: controller?.signal });
      snapshot.value = saved;
      return true;
    } catch (cause) {
      error.value = errorText(cause);
      showError({ title: tr('保存失败', 'Could not save'), error: cause });
      return false;
    } finally { saving.value = false; }
  }
  void load();
  onScopeDispose(() => { generation++; controller?.abort(); });
  return { snapshot, catalog, loading, saving, error, choice, id, model, provider, preset, choose, load, save, setSecret, secretValue };
}
