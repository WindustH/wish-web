// Server configuration draft and provider management.
import { bus } from '../../core/bus.ts';
import { ref, computed } from 'vue';
import { get, put } from '../../core/api/client.ts';
import { requireAvailableModel } from '../../core/api/endpoints.ts';
import { replayConfigChanges } from '../../core/configMerge.ts';
import { errorText } from '../../core/config-editor.ts';
import { tr } from './fields.ts';
import { providerName } from '../../ui/providerPresentation.ts';
import { showError } from '../../ui/errorDialog.ts';
import { toast } from '../../ui/toast.ts';
import type { ConfigCatalog, ProviderPreset } from '../../core/provider-presets.ts';
import type { ShellCatalog } from './ServerShellSettings.vue';

export const PROTOCOL_OPTIONS = [
  'openai_responses',
  'plaintext_responses',
  'codex_responses',
  'openai_chat',
  'compatible_chat',
  'deepseek_chat',
  'qwen_chat',
  'kimi_k2_chat',
  'kimi_k3_chat',
  'zai_chat',
  'minimax_chat',
  'mimo_chat',
  'tokenhub_chat',
  'mistral_chat',
  'anthropic_messages',
  'deepseek_messages',
  'qwen_messages',
  'kimi_messages',
  'zai_messages',
  'minimax_messages',
  'mimo_messages',
  'tokenhub_messages',
  'google_generate_content',
  'google_vertex_generate_content',
  'google_interactions',
  'bedrock_converse',
  'mistral_conversations',
];

export function useConfigDraft() {
  const draft = ref<any>();
  const revision = ref('');
  const source = ref('');
  const busy = ref(false);
  const error = ref('');
  const notice = ref('');

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

  const providerOptions = computed(() =>
    Object.entries(draft.value?.providers ?? {}).map(([id, value]) => {
      const p = findPreset((value as any).preset);
      return {
        value: id,
        label: (value as any).display_name || (p ? providerName(p.provider) : id),
        brand: p?.provider,
      };
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
    error.value = '';
    try {
      const [configuration, presets, environment, installed] = await Promise.all([
        get('/config'),
        get('/provider-presets'),
        get('/proxy-environment'),
        // Only the picker needs it; the shell stays editable as a path without it.
        get('/shells').catch(() => null),
      ]);
      catalog.value = presets;
      proxyEnvironment.value = environment.variables;
      shells.value = installed;
      accept(configuration);
    } catch (e) {
      error.value = errorText(e);
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
      error.value = '';
      return true;
    } catch (e) {
      error.value = errorText(e);
      showError({ title: tr('无法应用配置 JSON', 'Could not apply the JSON'), error: e });
      return false;
    }
  }

  async function saveConfig() {
    for (const id of Object.keys(advancedPending.value)) {
      if (advancedPending.value[id] && !applyAdvanced(id)) return false;
    }
    busy.value = true;
    error.value = '';
    notice.value = '';
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
        saved = await put('/config', { revision: revision.value, config: draft.value });
      } catch (cause) {
        if ((cause as { status?: number })?.status !== 409) throw cause;
        const latest = await get('/config');
        const merged = replayConfigChanges(JSON.parse(source.value), draft.value, latest.config);
        saved = await put('/config', { revision: latest.revision, config: merged });
        rebased = true;
      }
      accept(saved);
      bus.emit('configuration.changed', {});
      notice.value = rebased
        ? tr('配置已更新；已合并本地修改并保存。','Configuration changed; local edits were merged and saved.')
        : tr('已保存并生效。正在运行的调用继续使用原配置。','Saved and applied. In-flight calls retain their configuration.');
      toast(notice.value);
      return true;
    } catch (e) {
      error.value = errorText(e);
      showError({ title: tr('保存失败', 'Could not save'), error: e });
      return false;
    } finally {
      busy.value = false;
    }
  }

  function addProvider(preset?: ProviderPreset) {
    const base = preset?.id || 'custom';
    let id = base;
    let suffix = 2;
    while (draft.value.providers[id]) id = `${base}-${suffix++}`;
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
        error: tr('默认模型属于这个提供商。请先在“服务与会话”中更换默认模型，再删除它。', 'The default model belongs to this provider. Choose another default model in Service & sessions first.'),
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
    error,
    notice,
    catalog,
    proxyEnvironment,
    shells,
    adding,
    newProviderId,
    advanced,
    advancedPending,
    serverDirty,
    providerOptions,
    effortOptions,
    protocolOptions: PROTOCOL_OPTIONS,
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
