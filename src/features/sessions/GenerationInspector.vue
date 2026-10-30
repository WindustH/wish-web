<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import * as api from '../../core/api/endpoints.ts';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import SelectField from '../../domain/providers/SelectField.vue';
import CopyButton from '../../ui/components/CopyButton.vue';
import { generationText } from './generationText.ts';
import { measureChatElement, observeChatRect } from '../../domain/chat/virtualMeasurements.ts';
const props = defineProps<{ sessionId: string }>();
const isMobile = useIsMobile();
defineEmits<{ close: [] }>();
const generations = shallowRef<api.StoredGeneration[]>([]),
  page = shallowRef<api.GenerationStructure>();
const selected = ref<number>(),
  kind = ref(''),
  origin = ref('');
const busy = ref(false),
  error = ref(''),
  scroll = ref<HTMLElement>();
const detail = ref<{ title: string; text: string } | null>(null);
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
  ...kinds.map((value) => ({ value, label: value })),
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
  if ((!kind.value || kind.value === 'Tools') && !origin.value)
    entries.unshift({
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
    });
  return entries;
});
const virtualizer = useVirtualizer(
  computed(() => ({
    count: cards.value.length,
    getScrollElement: () => scroll.value ?? null,
    getItemKey: (index: number) => `${page.value?.generation.id}:${cards.value[index]!.position}`,
    estimateSize: () => 200,
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
      text: card.tools ? JSON.stringify(card.entry.message.Tools, null, 2) : generationText(card.entry.message),
    };
  }),
);
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
    start,
    kind.value === 'Tools' ? '' : kind.value,
    origin.value,
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
    offset = scroll.value?.scrollTop ?? 0;
  const target = keepPosition ? (page.value?.positions.at(-1) ?? 0) : 0;
  retry = () => {
    void replace(keepPosition);
  };
  try {
    let result = await fetchPage(selected.value, 0, controller.signal);
    while (keepPosition && kind.value !== 'Tools' && result.next != null && (result.positions.at(-1) ?? -1) < target)
      result = merge(result, await fetchPage(selected.value, result.next, controller.signal));
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
    else busy.value = false;
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
    if (result.next != null && result.next <= previous.next!) throw new Error('Non-advancing generation cursor');
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
    if (last != null && last >= cards.value.length - 4) void more();
  },
  { flush: 'post' },
);
function selectGeneration(value: string) {
  selected.value = Number(value);
  detail.value = null;
  void replace();
}
function selectKind(value: string) {
  kind.value = value === 'all' ? '' : value;
  detail.value = null;
  void replace();
}
function selectOrigin(value: string) {
  origin.value = value === 'all' ? '' : value;
  detail.value = null;
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
  <Modal
    :open="true"
    :page="isMobile"
    wide
    :title="tr('上下文结构', 'Context structure')"
    body-scroll="content"
    content-class="generation-inspector"
    @close="$emit('close')"
  >
    <div class="generation-filters">
      <label
        ><span class="generation-filter-label">Generation</span
        ><SelectField
          :model-value="String(selected ?? '')"
          :options="generationOptions"
          :disabled="busy"
          aria-label="Generation"
          @update:model-value="selectGeneration"
      /></label>
      <label
        ><span class="generation-filter-label">{{ tr('消息类型', 'Message type') }}</span
        ><SelectField
          :model-value="kind || 'all'"
          :options="kindOptions"
          :disabled="busy"
          :aria-label="tr('消息类型', 'Message type')"
          @update:model-value="selectKind"
      /></label>
      <label
        ><span class="generation-filter-label">{{ tr('来源', 'Origin') }}</span
        ><SelectField
          :model-value="origin || 'all'"
          :options="originOptions"
          :disabled="busy"
          :aria-label="tr('来源', 'Origin')"
          @update:model-value="selectOrigin"
      /></label>
      <button class="btn ghost sm generation-refresh" :disabled="busy" @click="refresh">
        {{ tr('刷新', 'Refresh') }}
      </button>
    </div>
    <div v-if="page" class="generation-meta">
      <span>{{ status(page.generation.status) }} · {{ page.count }} {{ tr('条目', 'entries') }}</span>
      <span>{{ tr('压缩游标', 'Compaction cursor') }}: {{ page.generation.compaction_cursor }}</span>
      <span v-if="page.generation.source"
        >{{ tr('来源', 'Source') }}: #{{ page.generation.source[0] }} · [0, {{ page.generation.source[1] }})</span
      >
      <button
        class="btn ghost sm"
        @click="detail = { title: `Generation #${page.generation.id}`, text: JSON.stringify(page.generation, null, 2) }"
      >
        {{ tr('结构与配置 JSON', 'Structure and settings JSON') }}
      </button>
    </div>
    <p v-if="error" role="alert">
      {{ error }} <button class="btn ghost sm" @click="retry()">{{ tr('重试', 'Retry') }}</button>
    </p>
    <div ref="scroll" class="generation-cards modal-scroll-region" :aria-busy="busy">
      <p v-if="page && !cards.length">{{ tr('没有符合条件的条目', 'No matching entries') }}</p>
      <div class="generation-space" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <div
          v-for="card in visible"
          :key="String(card.row.key)"
          :ref="measure"
          :data-index="card.row.index"
          class="generation-virtual-row"
          :style="{ transform: `translateY(${card.row.start}px)` }"
        >
          <article
            class="generation-entry"
            :data-role="card.role"
            :class="{
              summary: card.entry.origin === 'Summary',
              prefix: card.position < page!.generation.compaction_cursor,
            }"
          >
            <header>
              <strong>{{ card.role }}</strong
              ><span v-if="card.tools">{{ tr('Generation 配置', 'Generation configuration') }}</span
              ><span v-else>#{{ card.position }} · Entry {{ card.entry.id }} · {{ card.entry.origin }}</span
              ><span v-if="card.entry.message[card.role]?.fixed === true" class="cursor-tag">{{
                tr('固定指令', 'Pinned instruction')
              }}</span
              ><span v-if="card.entry.message[card.role]?.metadata?.source">{{
                card.entry.message[card.role].metadata.source
              }}</span
              ><span v-if="card.entry.model_call_id != null">Call {{ card.entry.model_call_id }}</span
              ><span v-if="card.position === page!.generation.compaction_cursor" class="cursor-tag">{{
                tr('压缩游标', 'Compaction cursor')
              }}</span>
            </header>
            <pre>{{ card.text.length > 6000 ? card.text.slice(0, 6000) + '\n…' : card.text }}</pre>
            <footer>
              <button
                class="btn ghost sm"
                @click="
                  detail = {
                    title: card.tools
                      ? `Tools · Generation #${page!.generation.id}`
                      : `${card.role} · Entry ${card.entry.id}`,
                    text: card.text,
                  }
                "
              >
                {{ tr('查看全文', 'Full text') }}</button
              ><button
                class="btn ghost sm"
                @click="
                  detail = {
                    title: card.tools ? `Tools · Generation #${page!.generation.id}` : `Entry ${card.entry.id} · JSON`,
                    text: JSON.stringify(card.tools ? card.entry.message.Tools : card.entry, null, 2),
                  }
                "
              >
                JSON</button
              ><CopyButton :text="card.text" />
            </footer>
          </article>
        </div>
      </div>
    </div>
    <div class="generation-load-status" role="status">
      <span v-if="busy">{{ tr('加载中…', 'Loading…') }}</span
      ><span v-else-if="page"
        >{{ tr('已加载', 'Loaded') }} {{ cards.length }} {{ tr('项', 'items')
        }}<template v-if="page.next == null || kind === 'Tools'">
          · {{ tr('已全部加载', 'All loaded') }}</template
        ></span
      >
    </div>
  </Modal>
  <Modal v-if="detail" :open="true" :page="isMobile" wide :title="detail.title" @close="detail = null"
    ><template #actions><CopyButton :text="detail.text" /></template>
    <pre class="generation-full-text">{{ detail.text }}</pre>
  </Modal>
</template>

<style scoped>
.generation-filters {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 12px;
}
.generation-filters label {
  display: flex;
  flex: 1;
  min-width: 110px;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
}
.generation-filters :deep(.control-select) {
  width: 100%;
  min-width: 0;
}
.generation-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  font-size: 12px;
  padding-bottom: 12px;
  opacity: 0.8;
}
.generation-cards {
  height: min(60dvh, 600px);
  min-height: 160px;
  overflow: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
}
.generation-space {
  position: relative;
  width: 100%;
}
.generation-virtual-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  padding-bottom: 12px;
  box-sizing: border-box;
}
.generation-entry {
  --entry-accent: var(--fg-subtle);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 0;
  padding: 12px 14px;
  background: var(--bg-sunken);
}
.generation-entry[data-role='System'],
.generation-entry[data-role='Developer'] {
  --entry-accent: var(--accent);
}
.generation-entry[data-role='User'] {
  --entry-accent: var(--ok);
}
.generation-entry[data-role='Reasoning'] {
  --entry-accent: var(--warn);
}
.generation-entry.summary {
  border-color: var(--warn);
}
.generation-entry header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: 11px;
  margin-bottom: 10px;
}
.generation-entry header strong {
  font-size: 13px;
  color: var(--entry-accent);
}
.generation-entry header span {
  opacity: 0.7;
}
.generation-entry header .cursor-tag {
  color: var(--warn);
  opacity: 1;
  border: 1px solid currentColor;
  border-radius: 4px;
  padding: 1px 4px;
}
.generation-entry pre,
.generation-full-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--mono);
}
.generation-entry pre {
  max-height: 220px;
  overflow: hidden;
}
.generation-entry footer {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding-top: 8px;
}
.generation-load-status {
  min-height: 24px;
  padding-top: 8px;
  font-size: 12px;
  color: var(--fg-subtle);
}
@media (min-width: 900px) {
  .generation-filters {
    align-items: center;
    gap: 8px 16px;
    padding-bottom: 8px;
  }
  .generation-filters label {
    flex: 0 1 auto;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .generation-filter-label {
    white-space: nowrap;
    color: var(--fg-subtle);
    font-size: 11px;
  }
  .generation-filters :deep(.control-select) {
    width: 136px;
    min-height: 32px;
    padding: 4px 8px;
    font-size: 12px;
  }
  .generation-refresh {
    margin-left: auto;
    min-height: 32px;
  }
  .generation-meta {
    gap: 4px 12px;
    padding-bottom: 8px;
    font-size: 11px;
  }
  .generation-meta .btn {
    min-height: 26px;
    padding: 2px 6px;
    font-size: 11px;
  }
}
@media (max-width: 899px) {
  .generation-cards {
    height: auto;
  }
  .generation-filters {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding-bottom: 8px;
  }
  .generation-filters label {
    min-width: 0;
    grid-column: span 2;
  }
  .generation-filter-label {
    display: none;
  }
  .generation-filters :deep(.control-select) {
    min-height: 40px;
    padding: 6px 10px;
    font-size: 14px;
  }
  .generation-filters label:first-child {
    grid-column: 1 / 4;
    grid-row: 1;
  }
  .generation-refresh {
    grid-column: 4;
    grid-row: 1;
    min-height: 40px;
    padding-inline: 6px;
  }
  .generation-meta {
    gap: 4px 10px;
    padding-bottom: 8px;
  }
}
</style>

<style>
@media (min-width: 900px) {
  .generation-inspector > .modal-head {
    padding: 6px 16px;
  }
  .generation-inspector > .modal-head .modal-title {
    font-size: 14px;
  }
  .generation-inspector > .modal-head .btn.icon-only {
    width: 32px;
    height: 32px;
    min-height: 32px;
  }
  .generation-inspector > .modal-body {
    padding: 12px 16px;
  }
}
</style>
