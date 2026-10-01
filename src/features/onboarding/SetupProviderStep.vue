<script setup lang="ts">
// Step 1: the provider. Providers already configured first, then the presets in the order settings
// lists them, and a custom one last, which stays when a search matches nothing. Choosing moves on.
import { computed, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { presetDescription, providerName } from '../../ui/providerPresentation.ts';
import { providerPriority } from '../../ui/catalogOrder.ts';
import Icon from '../../ui/components/Icon.vue';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import type { SetupState } from './useProviderSetup.ts';

const props = defineProps<{ setup: SetupState }>();
interface Choice { key: string; title: string; description: string; brand?: string; icon?: string; search: string }
const query = ref('');

const configured = computed<Choice[]>(() => Object.entries(props.setup.snapshot?.config.providers ?? {}).map(([id, provider]: [string, any]) => {
  const preset = props.setup.catalog.presets.find(item => item.id === provider.preset);
  return {
    key: `existing:${id}`,
    title: provider.display_name || (preset ? providerName(preset.provider) : id),
    description: preset ? `${presetDescription(preset)} · ${id}` : provider.base_url || id,
    brand: preset?.provider, icon: 'providers', search: `${id} ${provider.base_url ?? ''}`,
  };
}));
const presets = computed<Choice[]>(() => [...props.setup.catalog.presets]
  .sort((a, b) => providerPriority(a.provider) - providerPriority(b.provider))
  .map(preset => ({ key: `preset:${preset.id}`, title: providerName(preset.provider), description: presetDescription(preset),
    brand: preset.provider, search: `${preset.id} ${preset.provider} ${preset.region} ${preset.billing}` })));
const custom = computed<Choice>(() => ({ key: 'custom', title: tr('自定义提供商', 'Custom provider'),
  description: tr('OpenAI 兼容接口，或其他自建服务', 'An OpenAI-compatible API or another service you run'), icon: 'plus', search: 'custom openai compatible' }));
const matches = (item: Choice) => {
  const text = `${item.title} ${item.description} ${item.search}`.toLocaleLowerCase();
  return query.value.trim().toLocaleLowerCase().split(/\s+/).every(term => text.includes(term));
};
const shownConfigured = computed(() => configured.value.filter(matches));
const shownPresets = computed(() => presets.value.filter(matches));
const groups = computed(() => [
  { label: tr('已配置', 'Configured'), items: shownConfigured.value },
  { label: tr('全部提供商', 'All providers'), items: [...shownPresets.value, custom.value] },
].filter(group => group.items.length));
</script>

<template>
  <section class="setup-step">
    <header class="setup-title">
      <p class="setup-eyebrow">{{ tr('欢迎使用 Wish', 'Welcome to Wish') }}</p>
      <h1 tabindex="-1">{{ tr('选择模型提供商', 'Choose a model provider') }}</h1>
      <p>{{ tr('Wish 通过它调用模型。之后可以在设置里添加更多提供商。', 'Wish reaches models through it. You can add more providers in settings later.') }}</p>
    </header>
    <label class="setup-search">
      <Icon name="search" />
      <input v-model="query" type="search" data-autofocus :placeholder="tr('搜索提供商、地区或套餐', 'Search providers, regions or plans')" :aria-label="tr('搜索提供商', 'Search providers')" autocomplete="off" spellcheck="false" />
    </label>
    <div v-for="group in groups" :key="group.label" class="setup-group">
      <h2 v-if="configured.length" class="setup-group-label">{{ group.label }}</h2>
      <ul class="setup-list">
        <li v-for="item in group.items" :key="item.key">
          <button type="button" class="setup-row" :class="{ chosen: item.key === setup.choice }" @click="setup.choose(item.key)">
            <span class="setup-mark"><ProviderIcon :brand="item.brand" :fallback="item.icon" /></span>
            <span class="setup-row-text"><span>{{ item.title }}</span><small>{{ item.description }}</small></span>
            <Icon name="chevron-right" class="setup-row-go" />
          </button>
        </li>
      </ul>
    </div>
    <p v-if="query.trim() && !shownPresets.length && !shownConfigured.length" class="setup-hint setup-empty">
      {{ tr('没有匹配的预设。如果它提供 OpenAI 兼容接口，可以用自定义提供商连接。', 'No preset matches. If it offers an OpenAI-compatible API, connect it as a custom provider.') }}
    </p>
  </section>
</template>
