// Server configuration draft and provider management.
import { bus } from '../../core/bus.ts';
import { ref, computed, type InjectionKey } from 'vue';
import { requireAvailableModel, configSnapshot, configSave, providerPresets, proxyEnvironment as readProxyEnvironment, shellCatalog } from '../../core/api/endpoints.ts';
import { replayConfigChanges } from '../../core/configMerge.ts';
import { tr } from '../../core/i18n/tr.ts';
import { providerTitles } from '../../ui/providerPresentation.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
import type { ConfigCatalog, ProviderPreset } from '../../core/provider-presets.ts';
import type { ShellCatalog } from '../../core/api/endpoints.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { MODEL_PROTOCOLS } from '../../core/provider-presets.ts';


export function useConfigDraft() {
  const draft = ref<any>();
  const revision = ref('');
  const source = ref('');
  const busy = ref(false);

  const catalog = ref<ConfigCatalog>({ presets: [] });
  const proxyEnvironment = ref<{ name: string; value: string; redacted: boolean }[]>([]);
  const shells = ref<ShellCatalog | null>(null);
  const adding = ref(false);
  const newProviderId = ref('');

  const advanced = ref<Record<string, string>>({});
  const advancedPending = ref<Record<string, boolean>>({});

  const findPreset = (id?: string) => catalog.value.presets.find((p) => p.id === id);

  const serverDirty = computed(
    () =>
      !!draft.value &&
      (JSON.stringify(draft.value) !== source.value ||
        Object.values(advancedPending.value).some(Boolean))
  );

  // Names over the providers being edited; two instances of one vendor keep their IDs apart.
  const providerTitleMap = computed(() => providerTitles(
    Object.entries(draft.value?.providers ?? {}).map(([id, value]) => ({ id, display_name: (value as any).display_name, preset: (value as any).preset })),
  ));
  const providerTitle = (id: string) => providerTitleMap.value.get(id) ?? id;
  const providerOptions = computed(() =>
    Object.entries(draft.value?.providers ?? {}).map(([id, value]) => {
      const p = findPreset((value as any).preset);
      return { value: id, label: providerTitle(id), brand: p?.provider, preset: (value as any).preset as string | undefined };
    })
  );

  const effortOptions = computed(() => {
    const provider = draft.value?.providers[draft.value?.defaults.provider];
    const model = provider?.models?.[draft.value?.defaults.model];
    return [
      ...new Set([
        ...Object.keys(
          model?.reasoning_efforts ?? findPreset(provider?.preset)?.reasoning_efforts ?? {}
        ),
        draft.value?.defaults.reasoning?.effort,
      ].filter(Boolean)),
    ].map((value) => ({ value, label: value }));
  });

  function accept(value: any) {
    draft.value = value.config;
    revision.value = value.revision;
    source.value = JSON.stringify(value.config);
    advanced.value = {};
    advancedPending.value = {};
    for (const [id, p] of Object.entries(value.config.providers)) {
      advanced.value[id] = JSON.stringify(p, null, 2);
    }
  }

  async function load() {
    busy.value = true;
    try {
      const [configuration, presets, environment, installed] = await Promise.all([
        configSnapshot(),
        providerPresets(),
        readProxyEnvironment(),
        // Only the picker needs it; the shell stays editable as a path without it.
        shellCatalog().catch(() => null),
      ]);
      catalog.value = presets;
      proxyEnvironment.value = environment.variables;
      shells.value = installed;
      accept(configuration);
    } catch (e) {
      showError({ title: tr('无法载入设置', 'Could not load settings'), error: e, action: { label: tr('重试', 'Retry'), run: load } });
    } finally {
      busy.value = false;
    }
  }

  function applyAdvanced(id: string) {
    try {
      const value = JSON.parse(advanced.value[id]!);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(tr('提供商配置必须是 JSON 对象。', 'Provider configuration must be a JSON object.'));
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
      if (defaults?.provider && defaults?.model &&
          (defaults.provider !== savedDefaults?.provider || defaults.model !== savedDefaults?.model)) {
        await requireAvailableModel(
          { id: defaults.provider, ...draft.value.providers[defaults.provider] },
          defaults.model
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
      toast(rebased
        ? tr('配置已更新；已合并本地修改并保存。','Configuration changed; local edits were merged and saved.')
        : tr('已保存并生效。正在运行的调用继续使用原配置。','Saved and applied. In-flight calls retain their configuration.'));
      return true;
    } catch (e) {
      showError({ title: tr('保存失败', 'Could not save'), error: e });
      return false;
    } finally {
      busy.value = false;
    }
  }

  function addProvider(preset?: ProviderPreset) {
    const id = uniqueId(preset?.id || 'custom', taken => taken in draft.value.providers);
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
      ]) {
        provider[field] = (variant as any)[field] ?? null;
      }
    }
    provider.protocol = protocol;
  }

  function removeProvider(id: string) {
    // Refused here rather than at save time, where the server would reject it.
    if (draft.value.defaults?.provider === id) {
      showError({
        title: tr('无法删除提供商', 'Could not delete the provider'),
        error: tr('默认模型属于这个提供商。请先在“会话”设置中更换默认模型，再删除它。', 'The default model belongs to this provider. Choose another default model in the Sessions settings first.'),
      });
      return;
    }
    const borrowing = Object.entries(draft.value.search?.providers ?? {}).filter(([, item]: [string, any]) => item.auth_provider === id).map(([name]) => name);
    if (borrowing.length) {
      showError({
        title: tr('无法删除提供商', 'Could not delete the provider'),
        error: tr(`联网搜索的 ${borrowing.join('、')} 在借用这个提供商的账户。请先在“联网搜索”设置中删除或换掉它，再删除这个提供商。`, `The search provider ${borrowing.join(', ')} uses this provider's account. Remove it under Web search first.`),
      });
      return;
    }
    delete draft.value.providers[id];
    delete advancedPending.value[id];
  }

  return {
    draft,
    revision,
    source,
    busy,
    catalog,
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
