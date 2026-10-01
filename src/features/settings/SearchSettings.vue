<script setup lang="ts">
// The search providers web_search asks, in order, edited in the settings draft.
import { computed, onMounted, ref, watch } from 'vue';
import { ReorderGroup, ReorderItem } from 'motion-v';
import Icon from '../../ui/components/Icon.vue';
import AddSearchProvider, { type SearchChoice } from './AddSearchProvider.vue';
import SearchProvider, { type SearchProviderConfig } from './SearchProvider.vue';
import { searchPresets, type SearchPreset, type SearchProviderStatus } from '../../core/api/endpoints.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';
import { uniqueId } from '../../core/util/uniqueId.ts';

const props = defineProps<{
  config: any;
  // Configured model providers, for the searches their subscriptions come with.
  models: { value: string; label: string; brand?: string; preset?: string }[];
  save: () => Promise<boolean>;
  busy: boolean;
  dirty: boolean;
  // What the server knows of each provider; the settings page reads it.
  statuses: Record<string, SearchProviderStatus>;
}>();
const emit = defineEmits<{ checked: [] }>();
const isMobile = useIsMobile();

type Search = { order: string[]; providers: Record<string, SearchProviderConfig> };
const search = computed<Search>(() => (props.config.search ??= { order: [], providers: {} }));
// Every provider has a place in the order; the page keeps them together.
watch(() => Object.keys(search.value.providers), ids => {
  const order = search.value.order.filter(id => ids.includes(id));
  search.value.order = [...order, ...ids.filter(id => !order.includes(id))];
}, { immediate: true });
const order = computed({ get: () => search.value.order, set: (ids: string[]) => { search.value.order = ids; } });

const presets = ref<SearchPreset[]>([]);
onMounted(async () => {
  try { presets.value = (await searchPresets()).presets; } catch { /* the list below stays empty */ }
});

const presetOf = (id: string) => presets.value.find(preset => preset.id === id);
const lendersFor = (preset?: SearchPreset) => props.models.filter(model => model.preset && preset?.borrows_from?.includes(model.preset));

const adding = ref(false);
const opened = ref('');
// A borrowed search is ready as added; a service with its own key opens for its key.
function add({ preset, lender }: SearchChoice) {
  const id = uniqueId(preset.id.replace(/_search$/, ''), taken => taken in search.value.providers);
  search.value.providers[id] = lender
    ? { preset: preset.id, enabled: true, auth_provider: lender, proxy_enabled: true }
    : { preset: preset.id, enabled: true, proxy_enabled: true, api_key: null, base_url: null };
  if ((!lender && preset.key !== 'none') || preset.base_url_required) opened.value = id;
  adding.value = false;
}
function remove(id: string) {
  delete search.value.providers[id];
}
// On a phone the order changes from the provider's page, one place at a time.
function move(id: string, delta: number) {
  const ids = [...search.value.order], from = ids.indexOf(id), to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ...ids.splice(from, 1));
  search.value.order = ids;
}
</script>

<template>
  <section class="set-section">
    <header class="set-section-head"><h3>{{ tr('搜索提供商', 'Search providers') }}</h3><p>{{ tr('Web Search 按这里的顺序询问，前一个用不了（额度用尽、密钥失效、服务故障）时自动换下一个。订阅附带的搜索直接借用模型提供商的账户。拖动可以调整顺序。', 'Web Search asks these in order and moves on when one cannot answer - its quota spent, its key refused, its service down. Search that comes with a subscription uses the model provider\'s account. Drag to reorder.') }}</p></header>
    <div class="search-list">
      <ReorderGroup v-if="order.length" v-model:values="order" as="div" axis="y" class="search-order">
        <ReorderItem v-for="(id, index) in order" :key="id" :value="id" as="div" :drag-listener="!isMobile">
          <SearchProvider :id="id" :position="index + 1" :count="order.length" :value="search.providers[id]!" :preset="presetOf(search.providers[id]!.preset)" :status="statuses[id]" :lenders="lendersFor(presetOf(search.providers[id]!.preset))" :initially-open="id === opened" :save="save" :dirty="dirty" :busy="busy" @remove="remove(id)" @checked="emit('checked')" @move="move(id, $event)" />
        </ReorderItem>
      </ReorderGroup>
      <p v-if="!order.length" class="search-empty">{{ tr('还没有搜索提供商。', 'No search providers yet.') }}</p>
      <button type="button" class="provider-add" :disabled="busy" @click="adding = true"><span class="provider-add-icon"><Icon name="plus" /></span><span>{{ tr('添加搜索提供商', 'Add search provider') }}</span></button>
    </div>
  </section>

  <AddSearchProvider v-if="adding" :presets="presets" :models="models" :taken="Object.values(search.providers)" @close="adding = false" @select="add" />
</template>

<style scoped>
.search-list { display: grid; gap: 12px; }
.search-order { display: grid; gap: 12px; }
.search-empty { margin: 0; padding: 18px 16px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--fg-subtle); font-size: 13px; text-align: center; }
/* On a phone the providers, or the note that there are none, and the add row are one group. */
@media (max-width: 899px) {
  .search-list { gap: 0; overflow: hidden; border-radius: 18px; background: var(--bg-sunken); }
  .search-list > * + *, .search-order > * + * { border-top: 2px solid transparent; }
  .search-order { gap: 0; }
  .search-empty { border: 0; border-radius: 0; background: var(--bg-group); background-clip: padding-box; }
}
</style>
