// Server configuration draft and provider management.
import type { ConfigSnapshot } from '../../core/api/types.ts';
import type { SettingsConfig } from '../../core/configTypes.ts';
import { bus } from '../../core/bus.ts';
import { ref, computed, onScopeDispose, type InjectionKey } from 'vue';
import {
  requireAvailableModel,
  configSnapshot,
  configSave,
  providerPresets,
  searchPresets,
  fetchPresets,
  imagePresets,
  mediaPresets,
  type FetchPreset,
  proxyEnvironment as readProxyEnvironment,
  shellCatalog,
  type SearchPreset,
} from '../../core/api/endpoints.ts';
import { replayConfigChanges } from '../../core/configMerge.ts';
import { tr } from '../../core/i18n/tr.ts';
import { providerTitles } from '../../domain/providers/providerPresentation.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
import type { ConfigCatalog, ProviderPreset } from '../../core/provider-presets.ts';
import type { ShellCatalog } from '../../core/api/endpoints.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { MODEL_PROTOCOLS } from '../../core/provider-presets.ts';

export function useConfigDraft() {
  const snapshot = ref<SettingsConfig>();
  // Editors mount only after load; writes before that are an explicit programming error.
  const draft = computed({
    get() {
      if (!snapshot.value) throw new Error('Configuration is not loaded');
      return snapshot.value;
    },
    set(value: SettingsConfig) {
      snapshot.value = value;
    },
  });
  const revision = ref('');
  const source = ref('');
  const busy = ref(false);

  const catalog = ref<ConfigCatalog>({ presets: [] });
  // Read with the configuration, so a search provider shows its name from the start.
  const searchCatalog = ref<SearchPreset[]>([]);
  const fetchCatalog = ref<FetchPreset[]>([]);
  const mediaCatalog = ref<import('../../core/mediaGeneration.ts').MediaPreset[]>([]);
  const imageCatalog = ref<import('../../core/imageGeneration.ts').ImagePreset[]>([]);
  const proxyEnvironment = ref<{ name: string; value: string; redacted: boolean }[]>([]);
  const shells = ref<ShellCatalog | null>(null);
  const adding = ref(false);
  const newProviderId = ref('');

  const advanced = ref<Record<string, string>>({});
  const advancedPending = ref<Record<string, boolean>>({});

  const findPreset = (id?: string | null) => catalog.value.presets.find((p) => p.id === id);

  const serverDirty = computed(
    () =>
      !!snapshot.value &&
      (JSON.stringify(draft.value) !== source.value || Object.values(advancedPending.value).some(Boolean)),
  );

  // Names over the providers being edited; two instances of one vendor keep their IDs apart.
  const providerTitleMap = computed(() =>
    providerTitles(
      Object.entries(snapshot.value?.providers ?? {}).map(([id, value]) => ({
        id,
        display_name: (value as any).display_name,
        preset: (value as any).preset,
      })),
    ),
  );
  const providerTitle = (id: string) => providerTitleMap.value.get(id) ?? id;
  const providerOptions = computed(() =>
    Object.entries(snapshot.value?.providers ?? {}).map(([id, value]) => {
      const p = findPreset((value as any).preset);
      return {
        value: id,
        label: providerTitle(id),
        brand: p?.provider,
        preset: (value as any).preset as string | undefined,
      };
    }),
  );

  const effortOptions = computed(() => {
    const provider = snapshot.value?.providers[snapshot.value?.defaults.provider];
    const model = provider?.models?.[snapshot.value?.defaults.model ?? ''];
    return [
      ...new Set(
        [
          ...Object.keys(model?.reasoning_efforts ?? findPreset(provider?.preset)?.reasoning_efforts ?? {}),
          snapshot.value?.defaults.reasoning?.effort,
        ].filter((value): value is string => typeof value === 'string' && !!value),
      ),
    ].map((value) => ({ value, label: value }));
  });

  function accept(value: ConfigSnapshot) {
    draft.value = value.config;
    revision.value = value.revision;
    source.value = JSON.stringify(value.config);
    advanced.value = {};
    advancedPending.value = {};
    for (const [id, p] of Object.entries(value.config.providers)) {
      advanced.value[id] = JSON.stringify(p, null, 2);
    }
  }

  let loadGeneration = 0;
  onScopeDispose(() => {
    loadGeneration++;
  });
  async function load() {
    const own = ++loadGeneration;
    busy.value = true;
    try {
      const [configuration, presets, searches, readers, environment, installed, images, media] = await Promise.all([
        configSnapshot(),
        providerPresets(),
        // Without them, search providers show by their ids; the rest of settings still loads.
        searchPresets().catch(() => ({ presets: [] })),
        fetchPresets().catch(() => ({ presets: [] })),
        readProxyEnvironment(),
        // Only the picker needs it; the shell stays editable as a path without it.
        shellCatalog().catch(() => null),
        imagePresets().catch(() => ({ presets: [] })),
        mediaPresets().catch(() => ({ presets: [] })),
      ]);
      if (own !== loadGeneration) return;
      catalog.value = presets;
      searchCatalog.value = searches.presets;
      fetchCatalog.value = readers.presets;
      imageCatalog.value = images.presets;
      mediaCatalog.value = media.presets;
      proxyEnvironment.value = environment.variables;
      shells.value = installed;
      accept(configuration);
    } catch (e) {
      if (own !== loadGeneration) return;
      showError({
        title: tr('无法载入设置', 'Could not load settings'),
        error: e,
        action: { label: tr('重试', 'Retry'), run: load },
      });
    } finally {
      if (own === loadGeneration) busy.value = false;
    }
  }

  function applyAdvanced(id: string) {
    try {
      const value = JSON.parse(advanced.value[id]!);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(tr('提供商配置必须是 JSON 对象。', 'Provider configuration must be a JSON object.'));
      }
      const object = (item: unknown) => item != null && typeof item === 'object' && !Array.isArray(item);
      if (
        !['protocol', 'base_url', 'path', 'auth'].every((key) => typeof value[key] === 'string') ||
        !['models', 'credentials', 'credentials_env', 'headers'].every((key) => object(value[key])) ||
        !Object.values(value.models).every(object)
      ) {
        throw new Error(
          tr(
            '提供商配置缺少有效的协议、地址、模型或凭据映射。',
            'Provider configuration needs valid protocol, address, models and credential maps.',
          ),
        );
      }
      draft.value.providers[id] = value;
      advancedPending.value[id] = false;
      return true;
    } catch (e) {
      showError({ title: tr('无法应用配置 JSON', 'Could not apply the JSON'), error: e });
      return false;
    }
  }

  async function saveConfig() {
    for (const id of Object.keys(advancedPending.value)) {
      if (advancedPending.value[id] && !applyAdvanced(id)) return false;
    }
    busy.value = true;
    try {
      const defaults = draft.value.defaults;
      const savedDefaults = JSON.parse(source.value).defaults;
      if (
        defaults?.provider &&
        defaults?.model &&
        (defaults.provider !== savedDefaults?.provider || defaults.model !== savedDefaults?.model)
      ) {
        await requireAvailableModel(
          { id: defaults.provider, ...draft.value.providers[defaults.provider] },
          defaults.model,
          { provider: draft.value.providers[defaults.provider], accounts: draft.value.accounts },
        );
      }
      let saved;
      let rebased = false;
      try {
        saved = await configSave({ revision: revision.value, config: draft.value });
      } catch (cause) {
        if ((cause as { status?: number })?.status !== 409) throw cause;
        const latest = await configSnapshot();
        const merged = replayConfigChanges(JSON.parse(source.value), draft.value, latest.config);
        saved = await configSave({ revision: latest.revision, config: merged });
        rebased = true;
      }
      accept(saved);
      bus.emit('configuration.changed', {});
      toast(
        rebased
          ? tr('配置已更新；已合并本地修改并保存。', 'Configuration changed; local edits were merged and saved.')
          : tr(
              '已保存并生效。正在运行的调用继续使用原配置。',
              'Saved and applied. In-flight calls retain their configuration.',
            ),
      );
      return true;
    } catch (e) {
      showError({ title: tr('保存失败', 'Could not save'), error: e });
      return false;
    } finally {
      busy.value = false;
    }
  }

  function addProvider(preset?: ProviderPreset) {
    const id = uniqueId(preset?.id || 'custom', (taken) => taken in draft.value.providers);
    const first = preset?.protocols[0];
    draft.value.providers[id] =
      preset && first
        ? JSON.parse(JSON.stringify(preset.variants[first]))
        : {
            enabled: true,
            proxy_enabled: true,
            protocol: 'openai_chat',
            base_url: '',
            path: '/v1/chat/completions',
            auth: 'bearer',
            api_key: null,
            api_key_env: null,
            models: {},
            headers: {},
            credentials: {},
            credentials_env: {},
          };
    newProviderId.value = id;
    adding.value = false;
  }

  function changeProtocol(id: string, protocol: string) {
    const provider = draft.value.providers[id];
    const preset = findPreset(provider.preset);
    const variant = preset?.variants[protocol];
    if (variant) {
      for (const field of [
        'base_url',
        'path',
        'auth',
        'model_list',
        'model_list_path',
        'model_list_base_url',
        'token_count',
        'compaction',
        'account_state',
        'account_state_base_url',
      ] as const) {
        Object.assign(provider, { [field]: variant[field] ?? null });
      }
    }
    provider.protocol = protocol;
  }

  function removeProvider(id: string) {
    // Refused here rather than at save time, where the server would reject it.
    if (draft.value.defaults?.provider === id) {
      showError({
        title: tr('无法删除提供商', 'Could not delete the provider'),
        error: tr(
          '默认模型属于这个提供商。请先在“会话”设置中更换默认模型，再删除它。',
          'The default model belongs to this provider. Choose another default model in the Sessions settings first.',
        ),
      });
      return;
    }
    const dependent = [
      ...Object.entries(draft.value.mcp?.servers ?? {})
        .filter(([, item]) => item.auth_provider === id)
        .map(([name]) => `MCP · ${name}`),
      ...Object.entries(draft.value.fetch?.providers ?? {})
        .filter(([, item]) => item.auth_provider === id)
        .map(([name]) => `Web fetch · ${name}`),
    ];
    if (dependent.length) {
      showError({
        title: tr('无法删除提供商', 'Could not delete the provider'),
        error: tr(
          `以下服务仍在使用这个提供商，请先修改其关联：${dependent.join('、')}`,
          `These services still use this provider. Change their links first: ${dependent.join(', ')}`,
        ),
      });
      return;
    }
    const borrowing = Object.entries(draft.value.search?.providers ?? {})
      .filter(([, item]: [string, any]) => item.auth_provider === id)
      .map(([name]) => name);
    if (borrowing.length) {
      showError({
        title: tr('无法删除提供商', 'Could not delete the provider'),
        error: tr(
          `联网搜索的 ${borrowing.join('、')} 在借用这个提供商的账户。请先在“联网搜索”设置中删除或换掉它，再删除这个提供商。`,
          `The search provider ${borrowing.join(', ')} uses this provider's account. Remove it under Web search first.`,
        ),
      });
      return;
    }
    delete draft.value.providers[id];
    delete advancedPending.value[id];
  }

  return {
    ready: computed(() => !!snapshot.value),
    draft,
    revision,
    source,
    busy,
    catalog,
    searchCatalog,
    fetchCatalog,
    imageCatalog,
    mediaCatalog,
    proxyEnvironment,
    shells,
    adding,
    newProviderId,
    advanced,
    advancedPending,
    serverDirty,
    providerOptions,
    providerTitle,
    effortOptions,
    protocolOptions: MODEL_PROTOCOLS,
    findPreset,
    accept,
    load,
    applyAdvanced,
    saveConfig,
    addProvider,
    changeProtocol,
    removeProvider,
  };
}

export type ConfigDraft = ReturnType<typeof useConfigDraft>;
/** The settings page's configuration draft, for the parts of the page that edit it. */
export const configDraftKey: InjectionKey<ConfigDraft> = Symbol('configDraft');
