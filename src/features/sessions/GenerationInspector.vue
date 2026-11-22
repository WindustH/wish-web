<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import * as api from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SelectField from '../../domain/providers/SelectField.vue';
import CopyButton from '../../ui/components/CopyButton.vue';
import { generationText, generationToolResult } from './generationText.ts';
import { measureChatElement, observeChatRect } from '../../domain/chat/virtualMeasurements.ts';
const props = defineProps<{ sessionId: string }>();
const isMobile = useIsMobile();
const filtersOpen = ref(false);
const generations = shallowRef<api.StoredGeneration[]>([]),
  page = shallowRef<api.GenerationStructure>();
const selected = ref<number>(),
  kind = ref(''),
  origin = ref('');
const reversed = ref(false);
const busy = ref(false),
  error = ref(''),
  scroll = ref<HTMLElement>();
const detail = ref<{
  title: string;
  text: string;
  json: string;
  result?: NonNullable<ReturnType<typeof generationToolResult>>;
} | null>(null);
const resultView = ref('text');
const detailText = computed(() => {
  const value = detail.value;
  if (!value) return '';
  if (resultView.value === 'json') return value.json;
  if (value.result) return resultView.value === 'model' ? value.result.model : value.result.execution;
  return value.text;
});
const roleNames = computed<Record<string, string>>(() => ({
  Tools: tr('工具定义', 'Tool definitions'),
  System: tr('系统', 'System'),
  Developer: tr('开发者', 'Developer'),
  User: tr('用户', 'User'),
  Assistant: tr('助手', 'Assistant'),
  Reasoning: tr('思考', 'Reasoning'),
  ToolUse: tr('工具调用', 'Tool call'),
  ToolResult: tr('工具结果', 'Tool result'),
  UpstreamCompaction: tr('上游压缩', 'Upstream compaction'),
}));
const kinds = [
  'Tools',
  'System',
  'Developer',
  'User',
  'Assistant',
  'Reasoning',
  'ToolUse',
  'ToolResult',
  'UpstreamCompaction',
];
const origins = ['Imported', 'Input', 'Model', 'Tool', 'Interrupted', 'Context', 'Summary'];
let controller = new AbortController(),
  version = 0;
let retry: () => void = () => {
  void refresh();
};
const status = (value: string) =>
  ({ Active: tr('当前', 'Current'), Standby: tr('备用', 'Standby'), Sealed: tr('历史', 'Historical') })[value] ?? value;
const generationOptions = computed(() =>
  generations.value.map((generation) => ({
    value: String(generation.id),
    label: `#${generation.id} · ${status(generation.status)}`,
  })),
);
const kindOptions = computed(() => [
  { value: 'all', label: tr('全部类型', 'All types') },
  ...kinds.map((value) => ({ value, label: roleNames.value[value] ?? value })),
]);
const originOptions = computed(() => [
  { value: 'all', label: tr('全部来源', 'All origins') },
  ...origins.map((value) => ({ value, label: value })),
]);
const cards = computed(() => {
  if (!page.value) return [];
  const entries =
    kind.value === 'Tools'
      ? []
      : page.value.items.map((entry, index) => ({
          entry,
          position: page.value!.positions[index]!,
          role: Object.keys(entry.message)[0] ?? '',
          tools: false,
        }));
  if ((!kind.value || kind.value === 'Tools') && !origin.value) {
    const definitions = {
      entry: {
        id: -1,
        origin: 'Generation',
        recorded_at: 0,
        model_call_id: null,
        message: { Tools: page.value.generation.config.tools ?? [] },
      },
      position: -1,
      role: 'Tools',
      tools: true,
    };
    if (!reversed.value) entries.unshift(definitions);
    else if (page.value.next == null || kind.value === 'Tools') entries.push(definitions);
  }
  return entries;
});
const virtualizer = useVirtualizer(
  computed(() => ({
    count: cards.value.length,
    getScrollElement: () => scroll.value ?? null,
    getItemKey: (index: number) => `${page.value?.generation.id}:${cards.value[index]!.position}`,
    estimateSize: () => 84,
    overscan: 3,
    observeElementRect: observeChatRect,
    measureElement: measureChatElement,
    useAnimationFrameWithResizeObserver: true,
    anchorTo: 'start' as const,
    followOnAppend: false,
  })),
);
const visible = computed(() =>
  virtualizer.value.getVirtualItems().map((row) => {
    const card = cards.value[row.index]!;
    return {
      ...card,
      row,
      result: generationToolResult(card.entry.message),
      text: card.tools ? JSON.stringify(card.entry.message.Tools, null, 2) : generationText(card.entry.message),
    };
  }),
);
function read(card: (typeof visible.value)[number]) {
  resultView.value = card.result ? 'execution' : card.tools ? 'json' : 'text';
  detail.value = {
    title: card.tools ? roleNames.value.Tools! : (roleNames.value[card.role] ?? card.role) + ' · #' + card.entry.id,
    text: card.text,
    json: JSON.stringify(card.tools ? card.entry.message.Tools : card.entry, null, 2),
    result: card.result ?? undefined,
  };
}
function readConfig() {
  if (!page.value) return;
  resultView.value = 'json';
  detail.value = {
    title: tr('上下文配置', 'Context configuration'),
    text: '',
    json: JSON.stringify(page.value.generation, null, 2),
  };
}
function measure(element: unknown) {
  if (element) virtualizer.value.measureElement(element as HTMLElement);
}
function begin() {
  controller.abort();
  controller = new AbortController();
  busy.value = true;
  error.value = '';
  return ++version;
}
async function fetchPage(id: number, start: number, signal: AbortSignal) {
  return api.sessionGenerationStructure(
    props.sessionId,
    id,
    {
      start,
      kind: kind.value && kind.value !== 'Tools' ? kind.value : undefined,
      origin: origin.value || undefined,
      order: reversed.value ? 'desc' : undefined,
    },
    { signal },
  );
}
function merge(first: api.GenerationStructure, next: api.GenerationStructure) {
  // A standby can replace its membership while loading. Do not splice two different lists.
  if (JSON.stringify(first.generation.entries) !== JSON.stringify(next.generation.entries))
    throw new Error(tr('上下文已更新，请刷新。', 'Context changed; refresh to reload.'));
  return {
    ...next,
    start: 0,
    items: [...first.items, ...next.items],
    positions: [...first.positions, ...next.positions],
  };
}
async function replace(keepPosition = false) {
  if (selected.value == null) return;
  const own = begin(),
    offset = scroll.value?.scrollTop ?? 0,
    id = selected.value,
    signal = controller.signal;
  const target = keepPosition && kind.value !== 'Tools' ? page.value?.positions.at(-1) : undefined;
  retry = () => {
    void replace(keepPosition);
  };
  try {
    let result = await fetchPage(id, 0, signal);
    while (own === version && target != null && result.next != null) {
      const last = result.positions.at(-1);
      if (last != null && (reversed.value ? last <= target : last >= target)) break;
      result = merge(result, await fetchPage(id, result.next, signal));
    }
    if (own !== version) return;
    page.value = result;
    generations.value = generations.value.map((g) => (g.id === result.generation.id ? result.generation : g));
    await nextTick();
    if (scroll.value) scroll.value.scrollTop = keepPosition ? offset : 0;
  } catch (e) {
    if (own === version) error.value = String(e);
  } finally {
    if (own === version) busy.value = false;
  }
}
async function refresh() {
  const own = begin();
  retry = () => {
    void refresh();
  };
  try {
    const list: api.StoredGeneration[] = [];
    let cursor: number | null = 0;
    while (cursor !== null) {
      const result = await api.sessionGenerations(props.sessionId, cursor, { signal: controller.signal });
      if (own !== version) return;
      list.push(...result.items);
      cursor = result.next != null && result.next > cursor ? result.next : null;
    }
    generations.value = list;
    selected.value = list.some((g) => g.id === selected.value)
      ? selected.value
      : (list.find((g) => g.status === 'Active')?.id ?? list[0]?.id);
    if (selected.value != null) await replace(!!page.value);
    else {
      page.value = undefined;
      busy.value = false;
    }
  } catch (e) {
    if (own === version) {
      error.value = String(e);
      busy.value = false;
    }
  }
}
async function more() {
  if (busy.value || error.value || !page.value || page.value.next == null || kind.value === 'Tools') return;
  const previous = page.value,
    own = begin();
  retry = () => {
    error.value = '';
    void more();
  };
  try {
    const result = await fetchPage(previous.generation.id, previous.next!, controller.signal);
    if (own !== version) return;
    if (result.next != null && (reversed.value ? result.next >= previous.next! : result.next <= previous.next!))
      throw new Error('Non-advancing generation cursor');
    page.value = merge(previous, result);
  } catch (e) {
    if (own === version) error.value = String(e);
  } finally {
    if (own === version) busy.value = false;
  }
}
watch(
  () => [virtualizer.value.getVirtualItems().at(-1)?.index, cards.value.length, page.value?.next, busy.value],
  () => {
    const last = virtualizer.value.getVirtualItems().at(-1)?.index;
    if (!cards.value.length || (last != null && last >= cards.value.length - 4)) void more();
  },
  { flush: 'post' },
);
function selectGeneration(value: string) {
  selected.value = Number(value);
  detail.value = null;
  page.value = undefined;
  void replace();
}
function selectKind(value: string) {
  kind.value = value === 'all' ? '' : value;
  detail.value = null;
  page.value = undefined;
  void replace();
}
function selectOrigin(value: string) {
  origin.value = value === 'all' ? '' : value;
  detail.value = null;
  page.value = undefined;
  void replace();
}
function toggleOrder() {
  reversed.value = !reversed.value;
  detail.value = null;
  page.value = undefined;
  void replace();
}
watch(
  () => props.sessionId,
  () => {
    controller.abort();
    version++;
    generations.value = [];
    page.value = undefined;
    selected.value = undefined;
    kind.value = '';
    origin.value = '';
    reversed.value = false;
    detail.value = null;
    void refresh();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  version++;
  controller.abort();
});
</script>

<template>
  <section class="generation-inspector" :aria-label="tr('上下文', 'Context')">
    <div class="generation-filters">
      <SelectField
        :model-value="String(selected ?? '')"
        :options="generationOptions"
        :disabled="busy"
        aria-label="Generation"
        :placeholder="tr('选择代次', 'Select generation')"
        @update:model-value="selectGeneration"
      />
      <button class="btn ghost sm" :aria-expanded="filtersOpen" @click="filtersOpen = !filtersOpen">
        <Icon name="filter" :size="16" />{{ tr('筛选', 'Filter')
        }}<span v-if="kind || origin">{{ Number(!!kind) + Number(!!origin) }}</span>
      </button>
      <button
        type="button"
        class="btn ghost sm generation-order"
        :disabled="busy || selected == null"
        :aria-pressed="reversed"
        :aria-label="tr('倒序', 'Reverse order')"
        :data-hint="reversed ? tr('当前从新到旧', 'Newest first') : tr('倒序显示', 'Show newest first')"
        @click="toggleOrder"
      >
        <Icon name="arrow-down" :size="16" /><span>{{ tr('倒序', 'Reverse') }}</span>
      </button>
      <button
        class="btn ghost icon-only generation-refresh"
        :disabled="busy"
        :aria-label="tr('刷新', 'Refresh')"
        @click="refresh"
      >
        <Icon name="refresh-cw" :size="16" />
      </button>
      <div v-if="filtersOpen" class="generation-filter-fields">
        <SelectField
          :model-value="kind || 'all'"
          :options="kindOptions"
          :disabled="busy"
          :aria-label="tr('消息类型', 'Message type')"
          @update:model-value="selectKind"
        />
        <SelectField
          :model-value="origin || 'all'"
          :options="originOptions"
          :disabled="busy"
          :aria-label="tr('来源', 'Origin')"
          @update:model-value="selectOrigin"
        />
      </div>
    </div>
    <div v-if="page" class="generation-meta">
      <span>{{ tr('条目', 'Entries') }} · {{ page.count }}</span>
      <button class="btn ghost sm" @click="readConfig">
        <Icon name="tune" :size="14" />{{ tr('查看配置', 'View configuration') }}
      </button>
    </div>
    <p v-if="error" role="alert">
      {{ error }} <button class="btn ghost sm" @click="retry()">{{ tr('重试', 'Retry') }}</button>
    </p>
    <div ref="scroll" class="generation-cards" :aria-busy="busy">
      <p v-if="!busy && !error && !generations.length" class="hint">
        {{ tr('暂无上下文记录', 'No context recorded yet') }}
      </p>
      <p v-else-if="page && page.next == null && !cards.length" class="hint">
        {{ tr('没有符合条件的条目', 'No matching entries') }}
      </p>
      <div class="generation-space" :style="{ height: virtualizer.getTotalSize() + 'px' }">
        <div
          v-for="card in visible"
          :key="String(card.row.key)"
          :ref="measure"
          :data-index="card.row.index"
          class="generation-virtual-row"
          :style="{ transform: 'translateY(' + card.row.start + 'px)' }"
        >
          <button type="button" class="generation-entry" :data-role="card.role" @click="read(card)">
            <span class="generation-entry-head"
              ><strong>{{ roleNames[card.role] ?? card.role }}</strong>
              <span v-if="!card.tools">#{{ card.position }}</span>
              <span v-if="card.entry.message[card.role]?.fixed">{{ tr('固定指令', 'Pinned') }}</span>
              <span v-if="card.entry.origin === 'Summary'">{{ tr('摘要', 'Summary') }}</span>
              <span v-if="card.position === page!.generation.compaction_cursor">{{
                tr('压缩游标', 'Compaction cursor')
              }}</span>
              <Icon name="chevron-right" :size="14" />
            </span>
            <span class="generation-preview">{{
              card.tools && Array.isArray(card.entry.message.Tools)
                ? tr(card.entry.message.Tools.length + ' 个工具', card.entry.message.Tools.length + ' tools')
                : (card.result?.execution ?? card.text).slice(0, 320)
            }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="generation-load-status" role="status">
      <span v-if="busy">{{ tr('加载中…', 'Loading…') }}</span>
    </div>
  </section>
  <Modal v-if="detail" :open="true" :page="isMobile" wide :title="detail.title" @close="detail = null">
    <template #actions><CopyButton :text="detailText" /></template>
    <div v-if="detail.result || (detail.text && detail.text !== detail.json)" class="generation-result-tabs">
      <SelectField
        segmented
        v-model="resultView"
        :aria-label="tr('内容格式', 'Content format')"
        :options="
          detail.result
            ? [
                { value: 'execution', label: tr('完整执行结果', 'Execution result') },
                { value: 'model', label: tr('模型可见结果', 'Model-visible result') },
                { value: 'json', label: 'JSON' },
              ]
            : [
                { value: 'text', label: tr('正文', 'Text') },
                { value: 'json', label: 'JSON' },
              ]
        "
      />
    </div>
    <pre class="generation-full-text" :class="{ code: resultView !== 'text' }">{{ detailText }}</pre>
  </Modal>
</template>
<style scoped>
.generation-inspector {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.generation-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 8px;
  container-type: inline-size;
}
.generation-order[aria-pressed='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}
@container (max-width: 340px) {
  .generation-order span {
    display: none;
  }
}
.generation-filter-fields {
  grid-column: 1/-1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.generation-meta,
.generation-entry-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fg-subtle);
  font-size: 12px;
}
.generation-meta {
  justify-content: space-between;
  padding: 8px 0;
}
.generation-cards {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
}
.generation-space {
  position: relative;
}
.generation-virtual-row {
  position: absolute;
  inset: 0 0 auto;
}
.generation-entry {
  display: block;
  width: 100%;
  padding: 12px 6px;
  text-align: start;
  font: inherit;
  color: var(--fg);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.generation-entry:focus-visible {
  outline-offset: -2px;
}
@media (hover: hover) {
  .generation-entry:hover {
    background: var(--bg-hover);
  }
}
.generation-entry-head strong {
  font-size: 14px;
  color: var(--fg);
  font-weight: 600;
}
.generation-entry-head .icon {
  margin-inline-start: auto;
}
.generation-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin-top: 5px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.generation-load-status {
  flex: none;
  color: var(--fg-subtle);
  font-size: 12px;
}
.generation-result-tabs {
  margin-bottom: 12px;
}
.generation-full-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.65;
}
.generation-full-text.code {
  font: 13px/1.6 var(--mono);
}
</style>
