<script setup lang="ts">
// Picks a search service to add: the searches that come with a configured subscription first,
// then the services that take a key of their own. The same picker as adding a model provider.
import { computed } from 'vue';
import PickerDialog from '../../ui/components/PickerDialog.vue';
import type { SearchPreset } from '../../core/api/endpoints.ts';
import { presetBrand, providerName } from '../../ui/providerPresentation.ts';
import { tr } from '../../core/i18n/tr.ts';

export type SearchChoice = { preset: SearchPreset; lender?: string };

const props = defineProps<{
  presets: SearchPreset[];
  models: { value: string; label: string; preset?: string }[];
  // What is configured already: a borrowed search once per account.
  taken: { preset: string; auth_provider?: string | null }[];
}>();
const emit = defineEmits<{ close: []; select: [choice: SearchChoice] }>();

const region = (preset: SearchPreset) => preset.region === 'cn' ? tr('国内', 'China') : preset.region === 'global' ? tr('国际', 'Global') : '';
const choices = computed(() => {
  const list: (SearchChoice & { key: string; description: string; disabled?: boolean })[] = [];
  for (const preset of props.presets.filter(preset => preset.borrows_from?.length)) {
    const lenders = props.models.filter(model => model.preset && preset.borrows_from!.includes(model.preset));
    const free = lenders.filter(model => !props.taken.some(item => item.preset === preset.id && item.auth_provider === model.value));
    for (const model of free) {
      list.push({ key: `${preset.id}:${model.value}`, preset, lender: model.value, description: tr(`订阅附带 · 借用 ${model.label}，无需密钥`, `With your subscription · uses ${model.label}, no key`) });
    }
    if (!lenders.length) {
      const needed = [...new Set(preset.borrows_from!.map(id => providerName(presetBrand(id) ?? id)))].join(tr('或', ' or '));
      list.push({ key: preset.id, preset, disabled: true, description: tr(`订阅附带 · 需要先添加 ${needed} 模型提供商`, `With a subscription · add a ${needed} model provider first`) });
    }
  }
  for (const preset of props.presets.filter(preset => !preset.borrows_from?.length)) {
    const access = preset.key === 'none'
      ? (preset.base_url_required ? tr('自建 · 无需密钥', 'Self-hosted · no key') : tr('免费限速 · 无需密钥', 'Free, rate-limited · no key'))
      : tr('需要密钥', 'Needs a key');
    list.push({ key: preset.id, preset, description: [region(preset), access].filter(Boolean).join(' · ') });
  }
  return list;
});
const items = computed(() => choices.value.map(choice => ({
  key: choice.key,
  title: choice.preset.name,
  description: choice.description,
  search: `${choice.preset.id} ${choice.preset.name} ${choice.preset.brand ?? ''} ${choice.lender ?? ''}`,
  brand: choice.preset.brand,
  icon: 'globe',
  disabled: choice.disabled,
})));
function choose(key: string) {
  const choice = choices.value.find(item => item.key === key);
  if (choice && !choice.disabled) emit('select', { preset: choice.preset, lender: choice.lender });
}
</script>

<template>
  <PickerDialog :title="tr('添加搜索提供商', 'Add search provider')" :items="items" :placeholder="tr('搜索服务或订阅…', 'Search services or subscriptions…')" :page-chrome="160" @close="emit('close')" @choose="choose" />
</template>
