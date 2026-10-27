<script setup lang="ts">
// Picks a search service to add: the searches that come with a configured subscription first,
// then the services that take a key of their own. The same picker as adding a model provider.
import { computed } from 'vue';
import PickerDialog from '../../ui/domain/providers/PickerDialog.vue';
import type { SearchPreset } from '../../core/api/endpoints.ts';
import { presetBrand, providerName } from '../../ui/domain/providers/providerPresentation.ts';
import { tr } from '../../core/i18n/tr.ts';

export type SearchChoice = { preset: SearchPreset; lender?: string };

const props = defineProps<{
  presets: SearchPreset[];
  models: { value: string; label: string; preset?: string }[];
  // What is configured already: a borrowed search once per account.
  taken: { preset: string; credential_id?: string | null }[];
}>();
const emit = defineEmits<{ close: []; select: [choice: SearchChoice] }>();

const region = (preset: SearchPreset) =>
  preset.region === 'cn' ? tr('国内', 'China') : preset.region === 'global' ? tr('国际', 'Global') : '';
const choices = computed(() => {
  const list: (SearchChoice & { key: string; description: string; disabled?: boolean })[] = [];
  for (const preset of props.presets.filter((preset) => preset.borrows_from?.length)) {
    const lenders = props.models.filter((model) => model.preset && preset.borrows_from!.includes(model.preset));
    const free = lenders.filter(
      (model) => !props.taken.some((item) => item.preset === preset.id && item.credential_id === model.value),
    );
    for (const model of free) {
      list.push({
        key: `${preset.id}:${model.value}`,
        preset,
        lender: model.value,
        description: tr(
          `订阅附带 · 借用 ${model.label}，无需密钥`,
          `With your subscription · uses ${model.label}, no key`,
        ),
      });
    }
    if (!lenders.length) {
      const needed = [...new Set(preset.borrows_from!.map((id) => providerName(presetBrand(id) ?? id)))].join(
        tr('或', ' or '),
      );
      list.push({
        key: preset.id,
        preset,
        description: tr(`关联或新建 ${needed} 账户`, `Link or create a ${needed} account`),
      });
    }
  }
  for (const preset of props.presets.filter((preset) => !preset.borrows_from?.length)) {
    const access =
      preset.key === 'none'
        ? preset.base_url_required
          ? tr('自建 · 无需密钥', 'Self-hosted · no key')
          : tr('免费限速 · 无需密钥', 'Free, rate-limited · no key')
        : tr('需要密钥', 'Needs a key');
    list.push({ key: preset.id, preset, description: [region(preset), access].filter(Boolean).join(' · ') });
  }
  return list;
});
const items = computed(() =>
  choices.value.map((choice) => ({
    key: choice.key,
    title: choice.preset.name,
    description: choice.description,
    search: `${choice.preset.id} ${choice.preset.name} ${choice.preset.brand ?? ''} ${choice.lender ?? ''}`,
    brand: choice.preset.brand,
    icon: 'web-search',
    disabled: choice.disabled,
  })),
);
function choose(key: string) {
  const choice = choices.value.find((item) => item.key === key);
  if (choice && !choice.disabled) emit('select', { preset: choice.preset, lender: choice.lender });
}
</script>

<template>
  <PickerDialog
    :title="tr('添加搜索提供商', 'Add search provider')"
    :items="items"
    :placeholder="tr('搜索服务或订阅…', 'Search services or subscriptions…')"
    @close="emit('close')"
    @choose="choose"
  />
</template>
