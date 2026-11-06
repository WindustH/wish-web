import type { SettingsConfig } from '../../core/configTypes.ts';
import type { ConfigCatalog } from '../../core/provider-presets.ts';
import type { SearchPreset, FetchPreset } from '../../core/api/endpoints.ts';
import type { ImagePreset } from '../../core/imageGeneration.ts';
import type { MediaPreset } from '../../core/mediaGeneration.ts';
import type { AccountServiceOption } from './accountServiceTypes.ts';
import { providerName } from '../providers/providerPresentation.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';
import { tr } from '../../core/i18n/tr.ts';
import { defaultAccount, fetchAccountPresets } from './accountCompatibility.ts';

export interface ServiceCatalogs {
  models: ConfigCatalog;
  search: SearchPreset[];
  fetch: FetchPreset[];
  image: ImagePreset[];
  media: MediaPreset[];
}
export interface AccountServiceChoice extends AccountServiceOption {
  add: () => void;
}
export function accountServices(
  config: SettingsConfig,
  accountId: string,
  catalogs: ServiceCatalogs,
): AccountServiceChoice[] {
  const account = config.accounts[accountId];
  if (!account?.preset || account.preset === 'custom') return [];
  const ready = (allowed: string[], required: string[] = []) =>
    defaultAccount({ [accountId]: account }, allowed, required) === accountId;
  const linked = (
    providers: Record<string, { preset?: string | null; credential_id?: string | null }> | undefined,
    preset: string,
  ) =>
    Object.values(providers ?? {}).some((service) => service.preset === preset && service.credential_id === accountId);
  const choices: AccountServiceChoice[] = [];
  const model = catalogs.models.presets.find((preset) => preset.id === account.preset);
  const variant = model?.variants[model.protocols[0]!];
  if (model && variant && ready([model.id], model.required_credentials) && !linked(config.providers, model.id)) {
    choices.push({
      key: `providers:${model.id}`,
      title: providerName(model.provider),
      brand: model.provider,
      category: tr('模型', 'Models'),
      detail: variant.protocol,
      add() {
        if (linked(config.providers, model.id)) return;
        const id = uniqueId(model.id, (key) => key in config.providers);
        config.providers[id] = {
          ...JSON.parse(JSON.stringify(variant)),
          preset: model.id,
          credential_id: accountId,
          api_key: null,
          api_key_env: null,
          refresh_token: null,
          credentials: {},
          credentials_env: {},
        };
      },
    });
  }
  for (const preset of catalogs.search) {
    const allowed = preset.borrows_from?.length
      ? preset.borrows_from
      : [preset.id === 'jina' ? 'jina_reader' : preset.id];
    if (
      preset.key === 'none' ||
      preset.base_url_required ||
      !ready(allowed) ||
      linked(config.search?.providers, preset.id)
    )
      continue;
    choices.push({
      key: `search:${preset.id}`,
      title: preset.name,
      brand: preset.brand,
      category: tr('网页搜索', 'Web search'),
      add() {
        const section = (config.search ??= { order: [], providers: {} });
        if (linked(section.providers, preset.id)) return;
        const id = uniqueId(preset.id, (key) => key in section.providers);
        section.providers[id] = { preset: preset.id, credential_id: accountId, enabled: true, proxy_enabled: true };
        section.order.push(id);
      },
    });
  }
  for (const preset of catalogs.fetch) {
    const allowed = preset.account_preset ? [preset.account_preset] : fetchAccountPresets(preset.id);
    if (preset.key === 'none' || !ready(allowed) || linked(config.fetch?.providers, preset.id)) continue;
    choices.push({
      key: `fetch:${preset.id}`,
      title: preset.name,
      category: tr('网页读取', 'Web fetch'),
      add() {
        const section = (config.fetch ??= { order: [], providers: {} });
        if (linked(section.providers, preset.id)) return;
        const id = uniqueId(preset.id, (key) => key in section.providers);
        section.providers[id] = { preset: preset.id, credential_id: accountId, enabled: true, proxy_enabled: true };
        section.order.push(id);
      },
    });
  }
  for (const preset of catalogs.image) {
    if (
      !ready(preset.account_presets, preset.required_credentials) ||
      linked(config.image_generation?.providers, preset.id)
    )
      continue;
    choices.push({
      key: `image_generation:${preset.id}`,
      title: preset.name,
      brand: preset.brand,
      detail: preset.model,
      category: tr('图片生成', 'Image generation'),
      add() {
        const section = (config.image_generation ??= { order: [], providers: {} });
        if (linked(section.providers, preset.id)) return;
        const id = uniqueId(preset.id, (key) => key in section.providers);
        section.providers[id] = {
          preset: preset.id,
          credential_id: accountId,
          model: preset.model,
          enabled: true,
          proxy_enabled: true,
          parameters: {},
        };
        section.order.push(id);
      },
    });
  }
  for (const preset of catalogs.media) {
    const group =
      preset.kind === 'video'
        ? 'video_generation'
        : preset.kind === 'transcription'
          ? 'audio_transcription'
          : 'audio_generation';
    if (!ready(preset.account_presets, preset.required_credentials) || linked(config[group]?.providers, preset.id))
      continue;
    choices.push({
      key: `${group}:${preset.id}`,
      title: preset.name,
      brand: preset.brand,
      detail: preset.model,
      category:
        preset.kind === 'video'
          ? tr('视频生成', 'Video generation')
          : preset.kind === 'transcription'
            ? tr('语音转写', 'Transcription')
            : tr('音频生成', 'Audio generation'),
      add() {
        const section = (config[group] ??= { order: [], providers: {} });
        if (linked(section.providers, preset.id)) return;
        const id = uniqueId(preset.id, (key) => key in section.providers);
        section.providers[id] = {
          preset: preset.id,
          credential_id: accountId,
          model: preset.model,
          enabled: true,
          proxy_enabled: true,
          parameters: { ...preset.defaults },
        };
        section.order.push(id);
      },
    });
  }
  return choices;
}
