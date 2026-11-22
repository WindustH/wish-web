<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import * as api from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import { fmtBytes, fmtDateTime } from '../../core/util/fmt.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import Markdown from '../../ui/components/Markdown.vue';
import { highlightCode } from '../../ui/codeHighlight.ts';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SelectField from '../../domain/providers/SelectField.vue';
import CopyButton from '../../ui/components/CopyButton.vue';
import {
  generationMessageBytes,
  generationMessagePreview,
  generationText,
  generationToolResult,
  generationToolSummary,
} from './generationText.ts';
import { toolIcon } from './entries/processDetails.ts';
import { measureChatElement, observeChatRect } from '../../domain/chat/virtualMeasurements.ts';
const props = defineProps<{ sessionId: string; workingDirectory?: string }>();
const isMobile = useIsMobile();
const filtersOpen = ref(false);
const generations = shallowRef<api.StoredGeneration[]>([]),
  page = shallowRef<api.GenerationStructure>();
const selected = ref<number>(),
  kind = ref(''),
  origin = ref('');
const reversed = ref(false);
const quick = ref('all');
const busy = ref(false),
  error = ref(''),
  scroll = ref<HTMLElement>();
const detail = ref<{
  title: string;
  text: string;
  json: string;
  position?: number;
  tool?: string;
  callId?: string;
  recordedAt?: number;
  bytes?: number;
  markdown?: boolean;
  result?: NonNullable<ReturnType<typeof generationToolResult>>;
} | null>(null);
const resultView = ref('text');
const emptyModelResult = computed(() => tr('模型可见结果为空', 'The model-visible result is empty'));
const detailText = computed(() => {
  const value = detail.value;
  if (!value) return '';
  if (resultView.value === 'json') return value.json;
  if (value.result) return resultView.value === 'model' ? value.result.model : value.result.execution;
  return value.text;
});
const highlighted = computed(() =>
  resultView.value === 'json' || resultView.value === 'execution' ? highlightCode(detailText.value, 'json') : '',
);
const detailIndex = computed(() => cards.value.findIndex((card) => card.position === detail.value?.position));
const canGoNext = computed(
  () =>
    detailIndex.value >= 0 &&
    (detailIndex.value < cards.value.length - 1 || (kind.value !== 'Tools' && page.value?.next != null)),
);
const roles = computed<Record<string, { label: string; icon: string }>>(() => ({
  Tools: { label: tr('工具定义', 'Tool definitions'), icon: 'extensions' },
  System: { label: tr('系统', 'System'), icon: 'settings' },
  Developer: { label: tr('开发者', 'Developer'), icon: 'instruction' },
  User: { label: tr('用户', 'User'), icon: 'account' },
  Assistant: { label: tr('助手', 'Assistant'), icon: 'bot' },
  Reasoning: { label: tr('思考', 'Reasoning'), icon: 'thinking' },
  ToolUse: { label: tr('工具调用', 'Tool call'), icon: 'tool' },
  ToolResult: { label: tr('工具结果', 'Tool result'), icon: 'terminal' },
  UpstreamCompaction: { label: tr('上游压缩', 'Upstream compaction'), icon: 'archive' },
}));
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
  ...Object.entries(roles.value).map(([value, { label }]) => ({ value, label })),
]);
const originOptions = computed(() => [
  { value: 'all', label: tr('全部来源', 'All origins') },
  { value: 'Imported', label: tr('导入', 'Imported') },
  { value: 'Input', label: tr('用户输入', 'User input') },
  { value: 'Model', label: tr('模型生成', 'Model output') },
  { value: 'Tool', label: tr('工具执行', 'Tool execution') },
  { value: 'Interrupted', label: tr('中止时保留', 'Kept after interruption') },
  { value: 'Context', label: tr('上下文', 'Context') },
  { value: 'Summary', label: tr('摘要', 'Summary') },
]);
const quickOptions = computed(() => [
  { value: 'all', label: tr('全部', 'All') },
  { value: 'dialogue', label: tr('对话', 'Dialogue') },
  { value: 'tools', label: tr('工具', 'Tools') },
]);
const cards = computed(() => {
  if (!page.value) return [];
  const entries =
    kind.value === 'Tools'
      ? []
      : page.value.items.flatMap((entry, index) => {
          const role = Object.keys(entry.message)[0] ?? '';
          if (quick.value === 'dialogue' && role !== 'User' && role !== 'Assistant') return [];
          if (quick.value === 'tools' && role !== 'ToolUse' && role !== 'ToolResult') return [];
          return [{ entry, position: page.value!.positions[index]!, role, tools: false }];
        });
  if (quick.value !== 'dialogue' && (!kind.value || kind.value === 'Tools') && !origin.value) {
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
    const message = card.entry.message;
    const tool = generationToolSummary(message, props.workingDirectory);
    const previous = cards.value[row.index - 1];
    const next = cards.value[row.index + 1];
    const paired = (neighbor: typeof previous) => {
      if (!tool || !neighbor || Math.abs(card.position - neighbor.position) !== 1) return false;
      const call = message.ToolUse?.call_id ?? message.ToolResult?.call_id;
      const other = message.ToolUse ? neighbor.entry.message.ToolResult : neighbor.entry.message.ToolUse;
      return !!call && call === other?.call_id;
    };
    const count = Array.isArray(message.Tools) ? message.Tools.length : 0;
    const preview = card.tools
      ? tr(`${count} 个工具`, `${count} tools`)
      : (tool?.preview ?? generationMessagePreview(message, props.workingDirectory));
    return {
      ...card,
      row,
      preview: preview.slice(0, 320),
      tool,
      bytes: generationMessageBytes(message),
      linkBefore: paired(previous),
      linkAfter: paired(next),
    };
  }),
);
function read(card: (typeof cards.value)[number]) {
  const label = roles.value[card.role]?.label ?? card.role;
  const message = card.entry.message;
  const result = generationToolResult(message);
  const tool = message.ToolUse ?? message.ToolResult;
  resultView.value = result ? 'model' : card.tools ? 'json' : 'text';
  detail.value = {
    title: card.tools ? label : `${label} · #${card.position}`,
    text: result || card.tools ? '' : generationText(message),
    json: JSON.stringify(card.tools ? message.Tools : card.entry, null, 2),
    result: result ?? undefined,
    position: card.position,
    tool: tool?.name,
    callId: tool?.call_id,
    recordedAt: card.entry.recorded_at,
    bytes: generationMessageBytes(message),
    markdown: card.role === 'User' || card.role === 'Assistant',
  };
}
async function moveDetail(offset: number) {
  const current = detail.value;
  const index = detailIndex.value;
  if (index < 0 || index + offset < 0) return;
  while (offset > 0 && canGoNext.value && !cards.value[index + offset] && !busy.value && !error.value) {
    await more();
    if (detail.value !== current) return;
  }
  const card = cards.value[index + offset];
  if (card) read(card);
}
function detailKey(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.target !== event.currentTarget ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    window.getSelection()?.toString()
  )
    return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    void moveDetail(event.key === 'ArrowUp' ? -1 : 1);
  }
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
  quick.value = 'all';
  detail.value = null;
  page.value = undefined;
  void replace();
}
function selectQuick(value: string) {
  quick.value = value;
  kind.value = '';
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
    quick.value = 'all';
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
      <button
        class="btn ghost icon-only generation-filter-toggle"
        :aria-label="tr('筛选', 'Filter')"
        :data-hint="tr('筛选', 'Filter')"
        :aria-expanded="filtersOpen"
        :data-filtered="!!(kind || origin)"
        @click="filtersOpen = !filtersOpen"
      >
        <Icon name="filter" :size="16" />
      </button>
      <button
        type="button"
        class="btn ghost icon-only generation-order"
        :disabled="busy || selected == null"
        :aria-pressed="reversed"
        :aria-label="tr('倒序', 'Reverse order')"
        :data-hint="reversed ? tr('当前从新到旧', 'Newest first') : tr('倒序显示', 'Show newest first')"
        @click="toggleOrder"
      >
        <Icon name="arrow-down" :size="16" />
      </button>
      <button
        class="btn ghost icon-only"
        :disabled="!page"
        :aria-label="tr('查看配置', 'View configuration')"
        :data-hint="tr('查看配置', 'View configuration')"
        @click="readConfig"
      >
        <Icon name="tune" :size="16" />
      </button>
      <button
        class="btn ghost icon-only generation-refresh"
        :disabled="busy"
        :aria-label="tr('刷新', 'Refresh')"
        :data-hint="tr('刷新', 'Refresh')"
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
      <span>{{ tr(`${page.count} 条`, `${page.count} entries`) }}</span>
      <SelectField
        segmented="always"
        :model-value="kind ? '' : quick"
        :options="quickOptions"
        :aria-label="tr('快捷筛选', 'Quick filters')"
        :disabled="busy"
        @update:model-value="selectQuick"
      />
    </div>
    <p v-if="error" role="alert">
      {{ error }} <button class="btn ghost sm" @click="retry()">{{ tr('重试', 'Retry') }}</button>
    </p>
    <div class="generation-card-frame">
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
            <div
              v-if="page!.generation.compaction_cursor > 0 && card.position === page!.generation.compaction_cursor"
              class="generation-boundary"
              :class="{ 'boundary-after': reversed }"
            >
              {{ tr('压缩游标', 'Compaction cursor') }}
            </div>
            <button
              type="button"
              class="generation-entry"
              :data-role="card.role"
              :class="{ 'tool-entry': card.tool, 'link-before': card.linkBefore, 'link-after': card.linkAfter }"
              @click="read(card)"
            >
              <span class="generation-role-mark">
                <Icon
                  class="generation-role-icon"
                  :name="card.tool ? toolIcon(card.tool.name) : (roles[card.role]?.icon ?? 'file')"
                  :size="16"
                />
              </span>
              <span class="generation-entry-body">
                <span class="generation-entry-head">
                  <strong>{{ roles[card.role]?.label ?? card.role }}</strong>
                  <span v-if="card.tool?.name" class="generation-tool-name">{{ card.tool.name }}</span>
                  <span v-if="!card.tools" class="generation-position">#{{ card.position }}</span>
                  <span
                    v-if="card.tool?.status"
                    class="generation-chip tool-status"
                    :class="{ failed: card.tool.failed }"
                    >{{ card.tool.status }}</span
                  >
                  <span v-if="card.entry.message[card.role]?.fixed" class="generation-chip">{{
                    tr('固定指令', 'Pinned')
                  }}</span>
                  <span v-if="card.entry.origin === 'Summary'" class="generation-chip">{{
                    tr('摘要', 'Summary')
                  }}</span>
                </span>
                <span v-if="card.preview" class="generation-preview">{{ card.preview }}</span>
              </span>
              <span class="generation-entry-tail">
                <span
                  class="generation-size"
                  :class="{ large: card.bytes > 20 * 1024 }"
                  :title="tr('条目估算大小', 'Estimated entry size')"
                  >{{ fmtBytes(card.bytes) }}</span
                >
                <Icon name="chevron-right" :size="14" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="generation-load-status" role="status">
      <span v-if="busy">{{ tr('加载中…', 'Loading…') }}</span>
    </div>
  </section>
  <Modal v-if="detail" :open="true" :page="isMobile" wide :title="detail.title" @close="detail = null">
    <template #actions>
      <template v-if="detail.position != null">
        <button
          class="btn ghost icon-only"
          :disabled="detailIndex <= 0"
          :aria-label="tr('上一条', 'Previous entry')"
          @click="moveDetail(-1)"
        >
          <Icon name="chevron-up" :size="16" />
        </button>
        <button
          class="btn ghost icon-only"
          :disabled="!canGoNext || busy"
          :aria-label="tr('下一条', 'Next entry')"
          @click="moveDetail(1)"
        >
          <Icon name="chevron-down" :size="16" />
        </button>
      </template>
      <CopyButton :text="detailText" />
    </template>
    <div v-if="detail.position != null" class="generation-detail-meta">
      <strong v-if="detail.tool" class="generation-tool-name">{{ detail.tool }}</strong>
      <span v-if="detail.recordedAt">{{ fmtDateTime(detail.recordedAt) }}</span>
      <span :title="tr('条目估算大小', 'Estimated entry size')">{{ fmtBytes(detail.bytes) }}</span>
      <code v-if="detail.callId" class="generation-call-id">{{ detail.callId }}</code>
    </div>
    <div class="generation-detail-body" tabindex="0" @keydown="detailKey">
      <div v-if="detail.result || (detail.text && detail.text !== detail.json)" class="generation-result-tabs">
        <SelectField
          segmented
          v-model="resultView"
          :aria-label="tr('内容格式', 'Content format')"
          :options="
            detail.result
              ? [
                  { value: 'model', label: tr('模型可见结果', 'Model-visible result') },
                  { value: 'execution', label: tr('执行数据', 'Execution data') },
                  { value: 'json', label: 'JSON' },
                ]
              : [
                  { value: 'text', label: tr('正文', 'Text') },
                  ...(detail.markdown ? [{ value: 'markdown', label: tr('预览', 'Preview') }] : []),
                  { value: 'json', label: 'JSON' },
                ]
          "
        />
      </div>
      <p v-if="resultView === 'model' && !detailText.trim()" class="hint">{{ emptyModelResult }}</p>
      <Markdown v-else-if="resultView === 'markdown'" :text="detailText" />
      <pre v-else-if="highlighted" class="generation-full-text code code-highlight" v-html="highlighted" />
      <pre v-else class="generation-full-text" :class="{ code: resultView !== 'text' }">{{ detailText }}</pre>
    </div>
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
  grid-template-columns: minmax(0, 1fr) repeat(4, auto);
  align-items: center;
  gap: 6px;
}
.generation-order[aria-pressed='true'],
.generation-filter-toggle[data-filtered='true'] {
  color: var(--accent);
  background: var(--accent-soft);
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
  min-height: 40px;
  margin: 6px 0;
  font-variant-numeric: tabular-nums;
}
.generation-card-frame {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: clip;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.generation-cards {
  flex: 1;
  min-height: 0;
  overflow: hidden auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
}
.generation-cards::-webkit-scrollbar-track:vertical {
  margin: 8px 0;
}
.generation-cards::-webkit-scrollbar-thumb {
  border-color: transparent;
  background-clip: padding-box;
}
.generation-cards > .hint {
  padding: 8px 12px;
}
@media (max-width: 899px) {
  .generation-card-frame {
    background: var(--bg-group);
    border: 0;
    border-radius: 16px;
  }
}
.generation-space {
  position: relative;
}
.generation-virtual-row {
  position: absolute;
  inset: 0 0 auto;
  display: flex;
  flex-direction: column;
}
.generation-entry {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 8px;
  width: 100%;
  padding: 12px 10px;
  text-align: start;
  font: inherit;
  color: var(--fg);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.generation-entry.tool-entry {
  align-items: center;
  padding-block: 7px;
}
.generation-entry.link-before::before,
.generation-entry.link-after::after {
  content: '';
  position: absolute;
  left: 22px;
  height: 50%;
  border-left: 2px solid var(--line);
  pointer-events: none;
}
.generation-entry.link-before::before {
  top: 0;
}
.generation-entry.link-after::after {
  bottom: 0;
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
.generation-entry-head {
  flex-wrap: wrap;
  row-gap: 2px;
}
.tool-entry .generation-entry-head strong {
  font-size: 12px;
  color: var(--fg-muted);
}
.generation-role-mark {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--bg-sunken);
  color: var(--fg-subtle);
}
.generation-entry[data-role='User'] .generation-role-mark {
  background: var(--accent-soft);
  color: var(--accent);
}
.generation-entry[data-role='Assistant'] .generation-role-mark {
  color: var(--fg);
}
.generation-tool-name {
  min-width: 0;
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--mono);
}
.generation-position,
.generation-size,
.generation-chip {
  font-variant-numeric: tabular-nums;
}
.generation-chip {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--bg-sunken);
  line-height: 1.35;
  white-space: nowrap;
}
.generation-chip.failed {
  color: var(--err);
}
.generation-entry-tail {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  color: var(--fg-subtle);
  font: 11px var(--mono);
  white-space: nowrap;
}
.generation-size.large {
  color: var(--warn);
}
.generation-boundary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  font-size: 11px;
  color: var(--fg-subtle);
  background: var(--bg-sunken);
}
.generation-boundary.boundary-after {
  order: 1;
}
.generation-boundary::before,
.generation-boundary::after {
  content: '';
  flex: 1;
  border-top: 1px dashed var(--line-strong);
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
.generation-entry[data-role='User'] .generation-preview,
.generation-entry[data-role='Assistant'] .generation-preview {
  color: var(--fg);
}
.tool-entry .generation-preview {
  display: block;
  margin-top: 2px;
  font: 12px/1.5 var(--mono);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.generation-load-status {
  flex: none;
  color: var(--fg-subtle);
  font-size: 12px;
}
.generation-result-tabs {
  margin-bottom: 12px;
}
.generation-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  color: var(--fg-subtle);
}
.generation-call-id {
  user-select: all;
  overflow-wrap: anywhere;
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
