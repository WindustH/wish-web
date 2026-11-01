<script setup lang="ts">
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
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ session: string; blob: string }>();
const saved = useWorkspaceState('pdf', () => `${props.session}/${props.blob}`, {
  zoom: 1,
  index: 0,
  fraction: 0,
  left: 0,
  outline: false,
  version: '',
});
let pendingRestore: { index: number; fraction: number; left: number } | undefined;
const document = shallowRef<PdfInfo>();
const viewport = ref<HTMLElement>();
const active = usePageActivity();
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
      const top = next.starts[index]! + Math.max(0, Math.min(1, restore.fraction)) * next.heights[index]!;
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
      if (!controller.signal.aborted) error.value = describeError(cause).message;
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
});
</script>

<template>
  <div class="pdf-preview" :aria-busy="loading">
    <p v-if="error" role="alert" class="pdf-message">{{ error }}</p>
    <LoadingState v-else-if="loading" variant="overlay" :label="i18n.t('common.loading')" />
    <div v-if="document" class="pdf-toolbar">
      <button
        class="btn ghost icon-only"
        :aria-label="tr('书签', 'Bookmarks')"
        :aria-expanded="outlineOpen"
        @click="outlineOpen = !outlineOpen"
      >
        <Icon name="bookmark" />
      </button>
      <button
        class="btn ghost icon-only"
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
        class="btn ghost icon-only"
        :disabled="page >= document.pages"
        :aria-label="i18n.t('library.nextPage')"
        @click="goTo(page + 1)"
      >
        <Icon name="chevron-right" />
      </button>
      <span class="pdf-spacer" />
      <button
        class="btn ghost icon-only"
        :disabled="zoom <= 0.75"
        :aria-label="i18n.t('library.zoomOut')"
        @click="zoom = Math.max(0.75, zoom - 0.25)"
      >
        <Icon name="minus" />
      </button>
      <button
        class="btn ghost icon-only"
        :disabled="zoom >= 2.5"
        :aria-label="i18n.t('library.zoomIn')"
        @click="zoom = Math.min(2.5, zoom + 0.25)"
      >
        <Icon name="plus" />
      </button>
    </div>
    <nav v-if="outlineOpen" class="pdf-bookmarks" :aria-label="tr('书签', 'Bookmarks')">
      <p v-if="!bookmarks.length">{{ tr('此 PDF 没有书签', 'This PDF has no bookmarks') }}</p>
      <button
        v-for="(bookmark, index) in bookmarks"
        :key="index"
        class="btn ghost"
        :disabled="!bookmark.page"
        :style="{ paddingLeft: `${8 + Math.min(bookmark.depth, 8) * 12}px` }"
        @click="jump(bookmark)"
      >
        {{ bookmark.title }}
      </button>
    </nav>
    <div ref="viewport" class="pdf-viewport" @scroll.passive="scroll">
      <div v-if="document" class="pdf-scroll" :style="{ height: `${layout.total}px`, width: `${pageWidth}px` }">
        <div
          v-for="index in visible"
          :key="`${session}:${blob}:${document.version}:${index}`"
          class="pdf-page-host"
          :style="{ top: `${layout.starts[index]}px`, height: `${layout.heights[index]}px` }"
        >
          <PdfScrollPage
            :session="session"
            :blob="blob"
            :version="document.version"
            :page="index + 1"
            :width="pageWidth"
            @measured="measured(index, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-preview {
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
  height: 34px;
  padding: 0 2px;
  font: 12px/1.5 var(--font);
}
.pdf-toolbar .btn {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 4px;
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
.pdf-bookmarks button {
  display: block;
  width: 100%;
  text-align: left;
  white-space: normal;
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
