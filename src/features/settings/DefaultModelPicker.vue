<script setup lang="ts">
import { computed, ref } from 'vue';
import { modelLabel } from '../../ui/modelLabel';
import CommandPanel from '../../ui/components/CommandPanel.vue';
import PickerList from '../../ui/components/PickerList.vue';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import { tr } from './fields';
import type { SelectOption } from '../../ui/components/SelectField.vue';
const props = defineProps<{ config: any; providers: SelectOption[]; efforts: SelectOption[] }>();
const effortQuery = ref('');
const open = ref<'model' | 'effort' | ''>('');
const defaults = computed(() => props.config.defaults);
const selected = computed(() => JSON.stringify([defaults.value.provider, defaults.value.model]));
const choices = computed(() => props.providers.flatMap(provider => {
  const models = props.config.providers[provider.value]?.models ?? {};
  const ids = Object.keys(models);
  if (provider.value === defaults.value.provider && defaults.value.model && !ids.includes(defaults.value.model)) ids.unshift(defaults.value.model);
  return ids.map(id => ({key: JSON.stringify([provider.value, id]), title: modelLabel(id), search: id,
    group: provider.label, brand: provider.brand, vision: models[id]?.input_modalities?.includes('image')}));
}));
const efforts = computed(() => {
  const items = [{key: '', title: tr('上游默认', 'Upstream default')}, ...props.efforts.map(option => ({key:option.value,title:option.label}))];
  const custom = effortQuery.value.trim();
  if (custom && !items.some(item => item.key === custom)) items.push({key:custom,title:custom});
  return items;
});
function selectModel(key: string) {
  const [provider, model] = JSON.parse(key);
  defaults.value.provider = provider;
  defaults.value.model = model;
  open.value = '';
}
function selectEffort(value: string) {
  defaults.value.reasoning = {...defaults.value.reasoning, effort:value || null};
  open.value = '';
}
</script>
<template>
  <div class="default-model-control">
    <div class="default-model-chip">
      <button type="button" :aria-label="tr('默认模型','Default model')" :aria-expanded="open==='model'" @click="open='model'">{{modelLabel(defaults.model || '') || tr('选择模型','Select model')}}</button>
      <span aria-hidden="true">·</span>
      <button type="button" class="effort" :aria-label="tr('默认思考强度','Default reasoning effort')" :aria-expanded="open==='effort'" @click="open='effort'">{{(defaults.reasoning?.effort || tr('默认','Default')).toUpperCase()}}</button>
    </div>
    <CommandPanel v-if="open==='model'" :title="tr('默认模型','Default model')" @close="open=''">
      <PickerList :model-value="selected" :items="choices" :placeholder="tr('搜索模型…','Search models…')" @select="selectModel">
        <template #suffix="{itemKey}"><Hint v-if="choices.find(item=>item.key===itemKey)?.vision" :text="tr('支持视觉输入','Supports image input')"><Icon name="image" :aria-label="tr('视觉','Vision')"/></Hint></template>
      </PickerList>
    </CommandPanel>
    <CommandPanel v-if="open==='effort'" :title="tr('默认思考强度','Default reasoning effort')" @close="open=''">
      <PickerList :model-value="defaults.reasoning?.effort || ''" :items="efforts" v-model:query="effortQuery" :icons="false" :placeholder="tr('搜索或输入思考强度…','Search or enter reasoning effort…')" @select="selectEffort"/>
    </CommandPanel>
  </div>
</template>
<style scoped>
.default-model-control { min-width:0; }
.default-model-chip { display:inline-flex; align-items:center; max-width:100%; gap:0; padding:1px; border:1px solid var(--line-strong); border-radius:var(--radius); background:var(--bg-control); color:var(--fg); transition:background var(--dur-fast),border-color var(--dur-fast); }
.default-model-chip:is(:has(:focus-visible),:has(button[aria-expanded='true'])) { background:var(--bg-hover); }
@media (hover:hover) { .default-model-chip:hover { background:var(--bg-hover); } }
.default-model-chip button { min-width:0; min-height:32px; padding:5px 8px; border:0; border-radius:5px; background:transparent; color:var(--fg-muted); font:600 13px/1.4 var(--font); text-align:left; overflow-wrap:anywhere; cursor:pointer; }
@media (hover:hover) { .default-model-chip button:hover { color:var(--fg); } }
.default-model-chip button[aria-expanded='true'] { color:var(--accent); }
.default-model-chip .effort { flex-shrink:0; font-size:12px; color:var(--fg-subtle); }
@media (max-width:899px) { .default-model-chip button { min-height:40px; } }
</style>
