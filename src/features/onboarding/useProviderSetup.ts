import { computed, onScopeDispose, ref, shallowRef, type UnwrapNestedRefs } from 'vue';
import type { ConfigCatalog, ProviderConfig } from '../../core/provider-presets.ts';
import { ApiError } from '../../core/api/client.ts';
import { errorText } from '../../core/errors.ts';
import { providerReady } from '../../core/providerReadiness.ts';
import { readDraftCatalogModels } from '../../core/provider-catalog.ts';
import { tr } from '../../core/i18n/tr.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { REDACTED, secretText, readSecret, writeCredential } from '../../core/secretRef.ts';
import { configSnapshot, configSave, providerPresets } from '../../core/api/endpoints.ts';
import { presetProfile } from '../settings/preset-profile.ts';

// The first-run setup, in three steps: the provider, its credentials, then the model new sessions
// start with, chosen from the provider's own catalog once the credentials can read it. Nothing is
// saved before the last step, except what a ChatGPT sign-in must save to sign in. A preview walks
// the same steps against the real catalog and saves nothing.

export type SetupStep = 'provider' | 'auth' | 'model';
export const SETUP_STEPS: SetupStep[] = ['provider', 'auth', 'model'];
/** A model to choose: from the catalog, or one the preset or configuration names. */
export interface SetupModel { id: string; name?: string; context_window?: number | null; tag?: 'recommended' | 'configured' }
/** What the catalog read gave: models, none to give (the provider has no catalog), or a failure. */
type CatalogState = 'idle' | 'loading' | 'ready' | 'none' | 'failed';

// Laid out as the OpenAI-compatible presets are: the address ends in /v1 and paths follow it, so the
// model list of such a service is tried too.
const customProvider = (): ProviderConfig => ({ enabled: true, protocol: 'compatible_chat',
  base_url: '', path: '/chat/completions', auth: 'bearer', models: {}, model_list: 'openai_models', model_list_path: '/models',
  credentials: {}, credentials_env: {}, headers: {}, proxy_enabled: true });
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const filled = (value?: string | null) => !!value?.trim();
// Credentials asked for beside the key, by how the provider signs its requests.
const SIG_V4 = ['region', 'access_key_id', 'secret_access_key', 'session_token'];
const OPTIONAL = new Set(['session_token']);
// A catalog the provider cannot be asked for is no failure: the model is entered by hand.
const noCatalog = (cause: unknown) => cause instanceof ApiError
  && (cause.status === 501 || (cause.status === 400 && /model_list_path/.test(cause.detail)));

export function useProviderSetup({ preview = false } = {}) {
  const snapshot = shallowRef<any>();
  const catalog = shallowRef<ConfigCatalog>({ presets: [] });
  const loading = ref(true), saving = ref(false), error = ref('');
  const step = ref<SetupStep>('provider');
  const choice = ref(''), id = ref(''), model = ref('');
  const provider = ref<ProviderConfig>(customProvider());
  // The models the chosen preset or configured provider names, offered first.
  const named = shallowRef<SetupModel[]>([]);
  const models = shallowRef<SetupModel[]>([]);
  const catalogState = ref<CatalogState>('idle');
  const verifying = ref(false), verifyFailed = ref(false), signedIn = ref(false);
  const preset = computed(() => catalog.value.presets.find(item => item.id === provider.value.preset));
  const profile = computed(() => preset.value ? presetProfile(preset.value) : undefined);
  const existing = computed(() => choice.value.startsWith('existing:'));
  const custom = computed(() => choice.value === 'custom');
  const usesKey = computed(() => !['none', 'sig_v4'].includes(provider.value.auth));
  const credentialFields = computed(() => [...new Set([
    ...(preset.value?.required_credentials ?? []),
    ...(provider.value.auth === 'sig_v4' ? SIG_V4 : []),
  ])]);
  const optionalCredential = (field: string) => OPTIONAL.has(field) || !!preset.value?.optional_credentials.includes(field);
  let controller: AbortController | undefined;
  let generation = 0;

  function choose(value: string) {
    choice.value = value;
    const configured = value.startsWith('existing:') ? value.slice(9) : undefined;
    const selected = catalog.value.presets.find(item => `preset:${item.id}` === value);
    provider.value = structuredClone(configured ? snapshot.value.config.providers[configured]
      : selected ? selected.variants[selected.protocols[0]!] : customProvider());
    provider.value.enabled = true;
    provider.value.models ??= {};
    provider.value.credentials ??= {};
    provider.value.credentials_env ??= {};
    provider.value.headers ??= {};
    id.value = configured ?? selected?.id ?? 'custom';
    if (!configured) id.value = uniqueId(id.value, taken => taken in snapshot.value.config.providers);
    named.value = Object.keys(provider.value.models).map(model => ({ id: model, tag: configured ? 'configured' : 'recommended' }));
    model.value = configured === snapshot.value.config.defaults.provider ? snapshot.value.config.defaults.model : '';
    models.value = [];
    catalogState.value = 'idle';
    verifyFailed.value = false;
    signedIn.value = configured ? filled(provider.value.refresh_token) : false;
    error.value = '';
    step.value = 'auth';
  }

  async function load() {
    controller?.abort(); controller = new AbortController();
    const own = ++generation;
    loading.value = true; error.value = '';
    try {
      const [config, presets] = await Promise.allSettled([
        configSnapshot({ signal: controller.signal }), providerPresets({ signal: controller.signal }),
      ]);
      if (own !== generation) return;
      if (config.status === 'rejected') throw config.reason;
      snapshot.value = preview ? { ...config.value, config: { ...config.value.config, providers: {} } } : config.value;
      catalog.value = presets.status === 'fulfilled' ? presets.value : { presets: [] };
      step.value = 'provider';
    } catch (cause) { if (own === generation) error.value = errorText(cause); }
    finally { if (own === generation) loading.value = false; }
  }

  function setSecret(text: string, field?: string) {
    if (field) writeCredential(provider.value.credentials, provider.value.credentials_env, field, text);
    else { const { value, env } = readSecret(text); provider.value.api_key_env = env; provider.value.api_key = value; }
  }
  function secretValue(field?: string) {
    return field ? secretText(provider.value.credentials[field], provider.value.credentials_env[field]) : secretText(provider.value.api_key, provider.value.api_key_env);
  }
  /** Whether a secret is stored already: it shows redacted, and an empty field keeps it. */
  const stored = (field?: string) => (field ? provider.value.credentials[field] : provider.value.api_key) === REDACTED;

  const validUrl = (text: string) => { try { return ['http:', 'https:'].includes(new URL(text.trim()).protocol); } catch { return false; } };
  /** Why the credentials cannot be checked yet, or nothing when they can. */
  const authMissing = computed(() => {
    const current = provider.value;
    if (!validUrl(current.base_url)) return tr('填写以 http:// 或 https:// 开头的服务地址。', 'Enter a service address starting with http:// or https://.');
    if (!filled(id.value)) return tr('填写提供商 ID。', 'Enter a provider ID.');
    if (usesKey.value && !signedIn.value && !filled(current.api_key) && !filled(current.api_key_env)) return tr('填写密钥后继续。', 'Enter the key to continue.');
    const missing = credentialFields.value.find(field => !optionalCredential(field) && !filled(current.credentials[field]) && !filled(current.credentials_env[field]));
    return missing ? tr(`填写 ${missing} 后继续。`, `Enter ${missing} to continue.`) : '';
  });

  // The models to offer: those the preset or configuration names first, then the catalog's, newest first.
  function offer(read: any[]) {
    const byId = new Map(read.map(item => [item.id, item]));
    const first = named.value.map(item => ({ ...item, name: byId.get(item.id)?.display_name ?? undefined, context_window: byId.get(item.id)?.context_window }));
    const rest = read.filter(item => !named.value.some(entry => entry.id === item.id))
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0) || a.id.localeCompare(b.id))
      .map(item => ({ id: item.id, name: item.display_name && item.display_name !== item.id ? item.display_name : undefined, context_window: item.context_window }));
    return [...first, ...rest];
  }
  /** Reads the catalog with the credentials entered, which also checks them; on success, moves on. */
  async function verify() {
    if (authMissing.value || verifying.value) return;
    verifying.value = true; verifyFailed.value = false;
    catalogState.value = 'loading';
    try {
      const read = provider.value.model_list_path ? await readDraftCatalogModels(id.value.trim(), plain(provider.value), controller?.signal) : null;
      models.value = offer(read ?? []);
      catalogState.value = read ? 'ready' : 'none';
      step.value = 'model';
    } catch (cause) {
      if (noCatalog(cause)) {
        models.value = offer([]);
        catalogState.value = 'none';
        step.value = 'model';
        return;
      }
      catalogState.value = 'failed';
      verifyFailed.value = true;
      showError({ title: tr('无法用这些凭据读取模型列表', 'Could not read the model list with these credentials'), error: cause,
        hint: tr('请检查密钥和服务地址。如果确定无误，也可以跳过检查，手动填写模型。', 'Check the key and the service address. If they are right, skip the check and enter a model by hand.') });
    } finally { verifying.value = false; }
  }
  /** Moves on without a catalog: the model is entered by hand. */
  function skipVerify() {
    models.value = offer([]);
    step.value = 'model';
  }

  // The configuration with the chosen provider in it, and with it as the default when a model is given.
  function configWith(selectedModel?: string) {
    const name = id.value.trim();
    const current = plain(provider.value);
    current.base_url = current.base_url.trim(); current.path = current.path.trim();
    if (name in snapshot.value.config.providers && choice.value !== `existing:${name}`) throw new Error(tr('提供商 ID 已存在。', 'Provider ID already exists.'));
    const config = structuredClone(snapshot.value.config);
    if (selectedModel) {
      current.models[selectedModel] ??= {};
      config.defaults.provider = name; config.defaults.model = selectedModel;
      config.defaults.reasoning = { ...config.defaults.reasoning, effort: null };
    }
    config.providers[name] = current;
    return config;
  }

  async function save() {
    if (!snapshot.value || saving.value) return false;
    error.value = '';
    const selectedModel = model.value.trim();
    try {
      if (!selectedModel) throw new Error(tr('请选择或填写一个模型。', 'Choose or enter a model.'));
      const config = configWith(selectedModel);
      if (!providerReady(config.providers[id.value.trim()], selectedModel)) throw new Error(tr('请填写完整的连接地址和认证信息。', 'Complete the connection and credentials.'));
      saving.value = true;
      if (preview) {
        await new Promise(resolve => setTimeout(resolve, 400));
        toast(tr('预览完成：输入已通过检查，没有保存任何配置。', 'Preview finished: the entries passed the checks. Nothing was saved.'));
        return true;
      }
      snapshot.value = await configSave({ revision: snapshot.value.revision, config }, { signal: controller?.signal });
      return true;
    } catch (cause) {
      error.value = errorText(cause);
      showError({ title: tr('保存失败', 'Could not save'), error: cause });
      return false;
    } finally { saving.value = false; }
  }

  /** Saves the provider without making it the default, so the server can sign it in. */
  async function saveForSignIn() {
    if (preview || !snapshot.value) return false;
    try {
      snapshot.value = await configSave({ revision: snapshot.value.revision, config: configWith() }, { signal: controller?.signal });
      choice.value = `existing:${id.value.trim()}`;
      return true;
    } catch (cause) {
      showError({ title: tr('保存失败', 'Could not save'), error: cause });
      return false;
    }
  }
  /** After a ChatGPT or GitHub sign-in: takes the provider as saved, with its tokens, and reads its catalog. */
  async function signedInWithAccount() {
    try {
      snapshot.value = await configSnapshot({ signal: controller?.signal });
      const saved = snapshot.value.config.providers[id.value.trim()];
      if (saved) provider.value = { ...structuredClone(saved), enabled: true };
      signedIn.value = true;
      await verify();
    } catch (cause) { showError({ title: tr('无法读取配置', 'Could not read the configuration'), error: cause }); }
  }

  void load();
  onScopeDispose(() => { generation++; controller?.abort(); });
  return {
    preview, snapshot, catalog, loading, saving, error, step, choice, id, model, provider, preset, profile,
    existing, custom, usesKey, credentialFields, optionalCredential, authMissing, models, named, catalogState,
    verifying, verifyFailed, signedIn, choose, load, save, setSecret, secretValue, stored, verify, skipVerify,
    saveForSignIn, signedInWithAccount,
  };
}
export type ProviderSetup = ReturnType<typeof useProviderSetup>;
/** The setup as the step pages hold it: `reactive`, so its refs read without `.value`. */
export type SetupState = UnwrapNestedRefs<ProviderSetup>;
