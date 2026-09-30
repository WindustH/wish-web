<script setup lang="ts">
import { computed, effectScope, onScopeDispose, ref, shallowRef, watch, type EffectScope } from 'vue';
import { modelLabel } from '../../ui/modelLabel.ts';
import CommandPanel from '../../ui/components/CommandPanel.vue';
import PickerList from '../../ui/components/PickerList.vue';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import { tr } from '../../core/i18n/tr.ts';
import Spinner from '../../ui/components/Spinner.vue';
import { errorText } from '../../core/errors.ts';
import { useModelCatalog } from '../../ui/composables/useModelCatalog.ts';
import type { SelectOption } from '../../ui/components/SelectField.vue';
const props = defineProps<{ config: any; providers: SelectOption[]; efforts: SelectOption[] }>();
const effortQuery = ref('');
const open = ref<'model' | 'effort' | ''>('');
const defaults = computed(() => props.config.defaults);
const selected = computed(() => JSON.stringify([defaults.value.provider, defaults.value.model]));
// The same catalog the session picker offers: each provider's configured models, then what its
// upstream lists. It is read the first time the list opens; providers only in the unsaved draft
// offer their configured models.
let scope: EffectScope | undefined;
const catalog = shallowRef<ReturnType<typeof useModelCatalog>>();
watch(() => open.value === 'model', shown => {
  if (!shown || catalog.value) return;
  scope = effectScope();
  catalog.value = scope.run(useModelCatalog);
});
onScopeDispose(() => scope?.stop());
const choices = computed(() => props.providers.flatMap(provider => {
  const configured: Record<string, any> = props.config.providers[provider.value]?.models ?? {};
  const upstream = catalog.value?.groups.value.find(group => group.provider.id === provider.value)?.models ?? [];
  const models = new Map<string, any>(Object.entries(configured).map(([id, meta]) => [id, { ...upstream.find(model => model.id === id), ...meta }]));
  for (const model of upstream) if (!models.has(model.id)) models.set(model.id, model);
  const ids = [...models.keys()];
  if (provider.value === defaults.value.provider && defaults.value.model && !models.has(defaults.value.model)) ids.unshift(defaults.value.model);
  return ids.map(id => ({key: JSON.stringify([provider.value, id]), title: modelLabel(id), search: id,
    description: models.has(id) ? undefined : tr('配置和上游目录中都没有','Not configured or in the upstream catalog'),
    disabled: !models.has(id), group: provider.label, brand: provider.brand, vision: models.get(id)?.input_modalities?.includes('image')}));
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
      <button type="button" :aria-label="tr('默认模型','Default model')" :data-hint="defaults.model || ''" :aria-expanded="open==='model'" @click="open='model'">{{modelLabel(defaults.model || '') || tr('选择模型','Select model')}}</button>
      <span aria-hidden="true">·</span>
      <button type="button" class="effort" :aria-label="tr('默认思考强度','Default reasoning effort')" :aria-expanded="open==='effort'" @click="open='effort'">{{(defaults.reasoning?.effort || tr('默认','Default')).toUpperCase()}}</button>
    </div>
    <CommandPanel v-if="open==='model'" :title="tr('默认模型','Default model')" @close="open=''">
      <PickerList :model-value="selected" :items="choices" :placeholder="tr('搜索模型…','Search models…')" @select="selectModel">
        <template #suffix="{itemKey}"><Hint v-if="choices.find(item=>item.key===itemKey)?.vision" :text="tr('支持视觉输入','Supports image input')"><Icon name="image" :aria-label="tr('视觉','Vision')"/></Hint></template>
        <template #status>
          <div v-if="catalog?.error.value" class="command-status load-error" role="alert">{{ errorText(catalog.error.value) }}<button class="btn ghost sm" @click="catalog.reload">{{ tr('重试','Retry') }}</button></div>
          <p v-if="catalog?.pending.value" class="command-status hint" role="status"><Spinner /> {{ tr('正在读取上游模型…','Loading upstream models…') }}</p>
        </template>
        <template #after>
          <template v-for="group in catalog?.groups.value ?? []" :key="group.provider.id">
            <div v-if="group.error" class="load-error" role="alert">{{ group.provider.id }}: {{ errorText(group.error) }}<button class="btn ghost sm" :disabled="group.loading" @click="catalog?.loadGroup(group.provider.id)">{{ tr('重试','Retry') }}</button></div>
          </template>
        </template>
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
