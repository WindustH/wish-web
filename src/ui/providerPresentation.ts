import { i18n } from '../core/i18n/index.ts';
import type { ProviderPreset } from '../core/provider-presets.ts';

const names: Record<string, string> = {
  MiMo: '小米 MiMo', Zhipu: '智谱', SiliconFlow: '硅基流动', Qwen: '通义千问',
  'Tencent Hunyuan (TokenHub)': '腾讯混元 TokenHub', 'Google Gemini': 'Google Gemini',
};
const regions: Record<string, string> = { global: '全球', cn: '中国大陆', sgp: '新加坡', hk: '香港', us: '美国', de: '德国', jp: '日本', eu: '欧洲', local: '本地', custom: '自选地区' };
const englishRegions: Record<string,string> = {global:'Global',cn:'Mainland China',sgp:'Singapore',hk:'Hong Kong',us:'United States',de:'Germany',jp:'Japan',eu:'Europe',local:'Local',custom:'Custom region'};
const billing: Record<string, [string, string]> = {
  payg: ['按量付费', 'Pay as you go'], coding_plan: ['Coding Plan', 'Coding Plan'],
  token_plan: ['Token Plan', 'Token Plan'], payg_workspace: ['工作空间 · 按量付费', 'Workspace · Pay as you go'],
  subscription: ['订阅', 'Subscription'], local: ['本地运行', 'Local'],
};
export const providerName = (name: string) => ['Z.ai', 'Z AI', 'Z.AI'].includes(name) ? 'Z.AI' : i18n.locale.value === 'zh' ? names[name] || name : name;
export function presetDescription(preset: ProviderPreset) {
  const zh = i18n.locale.value === 'zh';
  const region = zh ? regions[preset.region] || preset.region : englishRegions[preset.region] || preset.region;
  const plan = billing[preset.billing]?.[zh ? 0 : 1] || preset.billing;
  return `${region} · ${plan}`;
}
export const presetLabel = (preset: ProviderPreset) => `${providerName(preset.provider)} · ${presetDescription(preset)}`;

type NamedProvider = { id: string; display_name?: string | null; preset?: string | null };

/** A provider's own name: its display name, else its preset's vendor, else its ID. */
export function providerBaseTitle(provider: NamedProvider): string {
  const brand = !provider.display_name && provider.preset ? presetBrand(provider.preset) : undefined;
  return provider.display_name || (brand ? providerName(brand) : provider.id);
}

/**
 * Names for providers shown side by side. Two instances of one vendor would read the
 * same ("DeepSeek"), so any name shared by several providers keeps the ID beside it:
 * "DeepSeek · deepseek-work". Names no other provider shares stay as they are.
 */
export function providerTitles(providers: readonly NamedProvider[]): Map<string, string> {
  const named = providers.map(provider => [provider.id, providerBaseTitle(provider)] as const);
  const counts = new Map<string, number>();
  for (const [, title] of named) counts.set(title.toLowerCase(), (counts.get(title.toLowerCase()) ?? 0) + 1);
  return new Map(named.map(([id, title]) => [id, (counts.get(title.toLowerCase()) ?? 0) > 1 && title !== id ? `${title} · ${id}` : title]));
}

// Brand identities belong to presentation; service endpoints and protocols
// remain authoritative in the backend preset catalog.
export function presetBrand(id: string) {
  const prefix = id.split('_')[0];
  return ({ mimo: 'MiMo', zai: 'Z.AI', zhipu: 'Zhipu', siliconflow: 'SiliconFlow', qwen: 'Qwen', kimi: 'Kimi', tencent: 'Tencent Hunyuan (TokenHub)', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google Gemini', aws: 'AWS Bedrock', minimax: 'MiniMax', openrouter: 'OpenRouter', huggingface: 'Hugging Face Router', opencode: 'OpenCode', mistral: 'Mistral', xai: 'xAI', groq: 'Groq', cerebras: 'Cerebras', ollama: 'Ollama', lm: 'LM Studio', vllm: 'vLLM', deepseek: 'DeepSeek' } as Record<string, string>)[prefix];
}
