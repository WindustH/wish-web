<script setup lang="ts">
import { useSidebarResize } from '../../ui/composables/useSidebarResize.ts';
const sidebarResizing = useSidebarResize();
import type { ReplyReference } from '../../core/replyReferences.ts';
import type { BlobLocation } from '../../core/blobMentions.ts';
import './nativePdf.css';
import PdfScrollPage from './PdfScrollPage.vue';
import LoadingState from '../../ui/components/LoadingState.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { pdfInfo, type PdfInfo } from './requests.ts';
import { pdfLayout, pdfPageAt, pdfWindow } from './pdfLayout.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import { usePinchZoom } from '../../ui/composables/usePinchZoom.ts';
import { useMiddlePan } from '../../ui/composables/useMiddlePan.ts';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{
  session: string;
  blob: string;
  name?: string;
  focus?: ReplyReference;
  location?: BlobLocation;
  toolbar?: HTMLElement;
}>();
const emit = defineEmits<{ error: [cause: unknown] }>();
const saved = useWorkspaceState('pdf', () => `${props.session}/${props.blob}`, {
  zoom: 1,
  index: 0,
  fraction: 0,
  left: 0,
  outline: false,
  version: '',
});
let pendingRestore: { index: number; fraction: number; left: number; anchorY?: number } | undefined;
const document = shallowRef<PdfInfo>();
const viewport = ref<HTMLElement>();
const active = usePageActivity();
watch(
  [() => props.focus, () => props.location, () => document.value],
  () => {
    const page = props.focus?.page ?? props.location?.page;
    if (page && document.value) void nextTick(() => jump({ page } as PdfInfo['bookmarks'][number]));
  },
  { flush: 'post' },
);

const zoom = ref(1),
  width = ref(300),
  height = ref(600),
  offset = ref(0);
const loading = ref(true),
  error = ref(''),
  outlineOpen = ref(false);
const ratios = shallowRef<ReadonlyMap<number, number>>(new Map());
const pageWidth = computed(() => Math.max(100, width.value) * zoom.value);
const layout = computed(() => pdfLayout(document.value?.pages ?? 0, pageWidth.value, ratios.value));
const visible = computed(() => pdfWindow(layout.value.starts, offset.value, height.value));
const page = computed(() => pdfPageAt(layout.value.starts, offset.value + height.value / 2) + 1);
const bookmarks = computed(() => document.value?.bookmarks ?? []);
const expandedBookmarks = ref(new Set<number>());
const outlineRows = computed(() => {
  const ancestors: { depth: number; index: number; visible: boolean }[] = [];
  return bookmarks.value
    .map((bookmark, index, items) => {
      while (ancestors.length && ancestors.at(-1)!.depth >= bookmark.depth) ancestors.pop();
      const parent = ancestors.at(-1);
      const visible = !parent || (parent.visible && expandedBookmarks.value.has(parent.index));
      ancestors.push({ depth: bookmark.depth, index, visible });
      return { ...bookmark, index, visible, children: (items[index + 1]?.depth ?? -1) > bookmark.depth };
    })
    .filter((row) => row.visible);
});
function toggleBookmark(index: number) {
  const next = new Set(expandedBookmarks.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  expandedBookmarks.value = next;
}
useMiddlePan(viewport);
function zoomContent(ratio: number, from: { x: number; y: number }, to: { x: number; y: number }) {
  const box = viewport.value;
  if (!box || !document.value) return;
  const bounds = box.getBoundingClientRect();
  const anchor = box.scrollTop + from.y - bounds.top;
  const index = pdfPageAt(layout.value.starts, anchor);
  const fraction = (anchor - layout.value.starts[index]!) / layout.value.heights[index]!;
  const next = Math.max(0.75, Math.min(2.5, zoom.value * ratio));
  const factor = next / zoom.value;
  const margin = 8 + Math.max(0, (width.value - pageWidth.value) / 2);
  const nextMargin = 8 + Math.max(0, (width.value - Math.max(100, width.value) * next) / 2);
  const left = (box.scrollLeft + from.x - bounds.left - margin) * factor + nextMargin - (to.x - bounds.left);
  const anchorY = to.y - bounds.top;
  if (next === zoom.value) {
    box.scrollTop = anchor - anchorY;
    box.scrollLeft = left;
    scroll();
  } else {
    pendingRestore = { index, fraction, left, anchorY };
    zoom.value = next;
  }
}
const pinching = usePinchZoom(viewport, zoomContent);
const wheelZooming = ref(false);
let wheelTimer: ReturnType<typeof setTimeout> | undefined;
function wheel(event: WheelEvent) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  wheelZooming.value = true;
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => {
    wheelZooming.value = false;
  }, 120);
  const point = { x: event.clientX, y: event.clientY };
  zoomContent(Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.005)), point, point);
}
watch(outlineOpen, (value) => {
  saved.value.outline = value;
});
function scroll() {
  if (active.value && viewport.value?.clientHeight) {
    offset.value = viewport.value.scrollTop;
    if (!pendingRestore && document.value && layout.value.starts.length) {
      const index = pdfPageAt(layout.value.starts, offset.value);
      saved.value = {
        zoom: zoom.value,
        index,
        fraction: (offset.value - layout.value.starts[index]!) / layout.value.heights[index]!,
        left: viewport.value.scrollLeft,
        outline: outlineOpen.value,
        version: document.value.version,
      };
    }
  }
}
watch(active, (visible) => {
  if (visible) void nextTick(scroll);
});
function goTo(value: number) {
  if (!document.value || !Number.isFinite(value)) return;
  const index = Math.max(0, Math.min(document.value.pages - 1, Math.round(value) - 1));
  if (viewport.value) viewport.value.scrollTop = layout.value.starts[index] ?? 0;
  scroll();
}
function enterPage(event: Event) {
  const input = event.target as HTMLInputElement;
  goTo(Number(input.value));
  input.value = String(page.value);
}
function jump(bookmark: PdfInfo['bookmarks'][number]) {
  if (!bookmark.page) return;
  goTo(bookmark.page);
  outlineOpen.value = false;
}
function measured(index: number, ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs((ratios.value.get(index) ?? 0) - ratio) < 0.001) return;
  ratios.value = new Map(ratios.value).set(index, ratio);
}
// Preserve the reading position when a newly measured page above it changes height,
// or when zoom / sidebar width changes. Browser scroll anchoring is disabled below.
watch(
  layout,
  (next, previous) => {
    const box = viewport.value;
    if (!box || !next.starts.length) return;
    if (pendingRestore) {
      const restore = pendingRestore;
      const index = Math.max(0, Math.min(next.starts.length - 1, Math.floor(restore.index)));
      const top = Math.max(
        0,
        next.starts[index]! +
          Math.max(0, Math.min(1, restore.fraction)) * next.heights[index]! -
          (restore.anchorY ?? 0),
      );
      offset.value = top;
      void nextTick(() => {
        if (layout.value !== next || pendingRestore !== restore) return;
        box.scrollTop = top;
        box.scrollLeft = restore.left;
        pendingRestore = undefined;
        scroll();
      });
      return;
    }
    if (!previous.starts.length) return;
    const index = Math.min(next.starts.length - 1, pdfPageAt(previous.starts, box.scrollTop));
    const fraction = (box.scrollTop - previous.starts[index]!) / previous.heights[index]!;
    const top = next.starts[index]! + fraction * next.heights[index]!;
    offset.value = top;
    void nextTick(() => {
      if (viewport.value === box && layout.value === next) {
        box.scrollTop = top;
        scroll();
      }
    });
  },
  { flush: 'pre' },
);

watch(
  () => [props.session, props.blob] as const,
  async (_, __, cleanup) => {
    const controller = new AbortController();
    cleanup(() => controller.abort());
    document.value = undefined;
    expandedBookmarks.value = new Set();
    ratios.value = new Map();
    zoom.value = Math.max(0.75, Math.min(2.5, saved.value.zoom));
    pendingRestore = { index: saved.value.index, fraction: saved.value.fraction, left: saved.value.left };
    offset.value = 0;
    if (viewport.value) viewport.value.scrollTop = 0;
    outlineOpen.value = saved.value.outline;
    loading.value = true;
    error.value = '';
    try {
      const info = await pdfInfo(props.session, props.blob, controller.signal);
      if (!controller.signal.aborted) {
        if (saved.value.version && saved.value.version !== info.version)
          pendingRestore = { index: 0, fraction: 0, left: 0 };
        document.value = info;
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        error.value = describeError(cause).message;
        emit('error', cause);
      }
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);
let observer: ResizeObserver | undefined;
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (!entry || entry.contentRect.width <= 0) return;
    height.value = entry.contentRect.height;
    scroll();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      width.value = Math.floor(entry.contentRect.width);
    }, 80);
  });
  if (viewport.value) observer.observe(viewport.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimeout(resizeTimer);
  clearTimeout(wheelTimer);
});
</script>

<template>
  <div class="pdf-preview" :aria-busy="loading">
    <p v-if="error" role="alert" class="pdf-message">{{ error }}</p>
    <LoadingState v-else-if="loading" variant="overlay" :label="i18n.t('common.loading')" />
    <Teleport :to="toolbar ?? 'body'" :disabled="!toolbar">
      <div v-if="document" class="pdf-toolbar" :class="{ 'pdf-toolbar-inline': !!toolbar }">
        <button
          class="btn ghost icon-only"
          :aria-label="tr('书签', 'Bookmarks')"
          :aria-expanded="outlineOpen"
          @click="outlineOpen = !outlineOpen"
        >
          <Icon name="bookmark" />
        </button>
        <button
          class="btn ghost icon-only pdf-page-step"
          :disabled="page <= 1"
          :aria-label="i18n.t('library.previousPage')"
          @click="goTo(page - 1)"
        >
          <Icon name="chevron-left" />
        </button>
        <label class="pdf-page-number">
          <input
            type="number"
            min="1"
            :max="document.pages"
            :value="page"
            :aria-label="i18n.t('library.pdfPage', { page })"
            @change="enterPage"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <span>/ {{ document.pages }}</span>
        </label>
        <button
          class="btn ghost icon-only pdf-page-step"
          :disabled="page >= document.pages"
          :aria-label="i18n.t('library.nextPage')"
          @click="goTo(page + 1)"
        >
          <Icon name="chevron-right" />
        </button>
        <span class="pdf-spacer" />
        <button
          class="btn ghost icon-only pdf-zoom-button"
          :disabled="zoom <= 0.75"
          :aria-label="i18n.t('library.zoomOut')"
          @click="zoom = Math.max(0.75, zoom - 0.25)"
        >
          <Icon name="minus" />
        </button>
        <button
          class="btn ghost sm pdf-zoom-reset"
          :title="tr('恢复为 100%（适合宽度）', 'Reset to 100% (fit width)')"
          @click="zoom = 1"
        >
          {{ Math.round(zoom * 100) }}%
        </button>
        <button
          class="btn ghost icon-only pdf-zoom-button"
          :disabled="zoom >= 2.5"
          :aria-label="i18n.t('library.zoomIn')"
          @click="zoom = Math.min(2.5, zoom + 0.25)"
        >
          <Icon name="plus" />
        </button>
      </div>
    </Teleport>
    <nav
      v-if="outlineOpen"
      class="pdf-bookmarks"
      :style="{ top: toolbar ? '0' : 'var(--pdf-toolbar-height)' }"
      :aria-label="tr('书签', 'Bookmarks')"
    >
      <p v-if="!bookmarks.length">{{ tr('此 PDF 没有书签', 'This PDF has no bookmarks') }}</p>
      <div
        v-for="bookmark in outlineRows"
        :key="bookmark.index"
        class="pdf-bookmark-row"
        :style="{ paddingLeft: `${8 + Math.min(bookmark.depth, 8) * 12}px` }"
      >
        <button
          v-if="bookmark.children"
          class="btn ghost icon-only pdf-bookmark-toggle"
          :aria-expanded="expandedBookmarks.has(bookmark.index)"
          :aria-label="`${expandedBookmarks.has(bookmark.index) ? tr('折叠', 'Collapse') : tr('展开', 'Expand')} ${bookmark.title}`"
          @click="toggleBookmark(bookmark.index)"
        >
          <Icon :name="expandedBookmarks.has(bookmark.index) ? 'chevron-down' : 'chevron-right'" :size="16" />
        </button>
        <span v-else class="pdf-bookmark-spacer" />
        <button class="btn ghost pdf-bookmark-link" :disabled="!bookmark.page" @click="jump(bookmark)">
          {{ bookmark.title }}
        </button>
      </div>
    </nav>
    <div ref="viewport" class="pdf-viewport" @scroll.passive="scroll" @wheel="wheel">
      <div v-if="document" class="pdf-scroll" :style="{ height: `${layout.total}px`, width: `${pageWidth}px` }">
        <div
          v-for="index in visible"
          :key="`${session}:${blob}:${document.version}:${index}`"
          class="pdf-page-host"
          :style="{ top: `${layout.starts[index]}px`, height: `${layout.heights[index]}px` }"
        >
          <PdfScrollPage
            :session="session"
            :name="name"
            :focus="focus"
            :blob="blob"
            :version="document.version"
            :page="index + 1"
            :width="pageWidth"
            :resizing="pinching || wheelZooming || sidebarResizing"
            @measured="measured(index, $event)"
            @error="emit('error', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-preview {
  --pdf-toolbar-height: 34px;
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.pdf-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  height: var(--pdf-toolbar-height, 34px);
  padding: 0 2px;
  font: 12px/1.5 var(--font);
}
.pdf-toolbar .btn {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 4px;
}
.pdf-toolbar .pdf-zoom-reset {
  width: auto;
  min-width: 44px;
  font-variant-numeric: tabular-nums;
}
@container (max-width: 520px) {
  .pdf-toolbar-inline .pdf-page-step {
    display: none;
  }
}
@container (max-width: 285px) {
  .pdf-toolbar-inline .pdf-zoom-button {
    display: none;
  }
}
.pdf-page-number {
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  color: var(--fg-muted);
}
.pdf-page-number input {
  width: 4ch;
  min-width: 0;
  height: 26px;
  padding: 0 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--fg);
  text-align: center;
  font: inherit;
  appearance: textfield;
}
.pdf-page-number input::-webkit-inner-spin-button,
.pdf-page-number input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
.pdf-spacer {
  flex: 1;
}
.pdf-bookmarks {
  position: absolute;
  top: 34px;
  inset-inline: 0;
  z-index: 3;
  max-height: 60%;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  box-shadow: 0 6px 20px #0002;
  padding-block: 4px;
}
.pdf-bookmark-row {
  display: flex;
  align-items: flex-start;
}
.pdf-bookmark-toggle,
.pdf-bookmark-spacer {
  flex: none;
  width: 28px;
  min-height: 32px;
}
.pdf-bookmark-link {
  flex: 1;
  min-width: 0;
  text-align: left;
  white-space: normal;
  justify-content: flex-start;
}
.pdf-bookmarks p {
  padding: 8px;
  color: var(--fg-muted);
}
.pdf-viewport {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overflow-anchor: none;
  scrollbar-gutter: stable;
  padding: 0 8px;
  background: var(--bg-sunken);
  border-radius: 6px;
}
.pdf-viewport.middle-panning,
.pdf-viewport.middle-panning :deep(*) {
  cursor: grabbing;
}
.pdf-scroll {
  position: relative;
  margin-inline: auto;
}
.pdf-page-host {
  position: absolute;
  left: 0;
  width: 100%;
}
.pdf-message {
  padding: 8px;
  color: var(--fg-muted);
}
</style>
