<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { pdfInfo, pdfPage, type PdfInfo } from './pdfPages.ts';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ session: string; blob: string }>();
const document = shallowRef<PdfInfo>();
const canvas = ref<HTMLCanvasElement | null>(null),
  viewport = ref<HTMLElement | null>(null);
const page = ref(1),
  zoom = ref(1),
  width = ref(300),
  loading = ref(true),
  painting = ref(false),
  painted = ref(false),
  error = ref('');
const active = usePageActivity();
const outlineOpen = ref(false);
const bookmarks = computed(() => document.value?.bookmarks ?? []);
function jump(bookmark: PdfInfo['bookmarks'][number]) {
  if (!bookmark.page || !document.value || bookmark.page < 1 || bookmark.page > document.value.pages) return;
  page.value = bookmark.page;
  if (viewport.value) viewport.value.scrollTop = 0;
  outlineOpen.value = false;
}
let wheelTotal = 0,
  lastWheel = 0,
  lastTurn = 0;
function wheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const box = viewport.value,
    pdf = document.value;
  if (!box || !pdf || !event.deltaY) return;
  const down = event.deltaY > 0;
  if (down ? box.scrollTop + box.clientHeight < box.scrollHeight - 2 : box.scrollTop > 2) {
    wheelTotal = 0;
    return;
  }
  event.preventDefault();
  const now = performance.now();
  if (now - lastWheel > 200 || Math.sign(wheelTotal) !== Math.sign(event.deltaY)) wheelTotal = 0;
  lastWheel = now;
  if (now - lastTurn < 350) return;
  wheelTotal += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.clientHeight : 1);
  if (Math.abs(wheelTotal) < 50) return;
  const next = Math.max(1, Math.min(pdf.pages, page.value + (down ? 1 : -1)));
  wheelTotal = 0;
  if (next === page.value) return;
  lastTurn = now;
  page.value = next;
}

watch(
  () => [props.session, props.blob] as const,
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    document.value = undefined;
    painted.value = false;
    outlineOpen.value = false;
    page.value = 1;
    zoom.value = 1;
    loading.value = true;
    error.value = '';
    try {
      const info = await pdfInfo(props.session, props.blob, controller.signal);
      if (!controller.signal.aborted) document.value = info;
    } catch (cause) {
      if (!controller.signal.aborted) error.value = describeError(cause).message;
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);

watch(
  [document, page, zoom, width, canvas, active],
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const pdf = document.value,
      element = canvas.value;
    if (!pdf || !element || !active.value) return;
    painting.value = true;
    error.value = '';
    const targetPage = page.value;
    const resolution = Math.min(
      2048,
      Math.max(384, Math.ceil((width.value * zoom.value * Math.min(devicePixelRatio || 1, 2)) / 256) * 256),
    );
    let objectUrl = '';
    try {
      const image = new Image();
      const bytes = await pdfPage(props.session, props.blob, targetPage, resolution, controller.signal, pdf.version);
      if (controller.signal.aborted) return;
      image.src = objectUrl = URL.createObjectURL(bytes);
      await image.decode();
      if (controller.signal.aborted) return;
      // Commit only a complete page, keeping the last frame visible while loading.
      element.width = image.naturalWidth;
      element.height = image.naturalHeight;
      element.style.width = `${width.value * zoom.value}px`;
      element.style.height = `${(width.value * zoom.value * image.naturalHeight) / image.naturalWidth}px`;
      element.getContext('2d')!.drawImage(image, 0, 0);
      painted.value = true;
      painting.value = false;
      // Current page always wins; cancel background reads on navigation/close.
      for (const neighbor of [targetPage + 1, targetPage - 1]) {
        if (neighbor < 1 || neighbor > pdf.pages || controller.signal.aborted) continue;
        await pdfPage(props.session, props.blob, neighbor, resolution, controller.signal, pdf.version).catch(() => {});
      }
    } catch (cause) {
      if (!controller.signal.aborted) error.value = describeError(cause).message;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (!controller.signal.aborted) painting.value = false;
    }
  },
  { flush: 'post' },
);
watch(page, () => {
  if (viewport.value) viewport.value.scrollTop = 0;
});
let observer: ResizeObserver | undefined;
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (!entry || entry.contentRect.width <= 0) return;
    const next = Math.max(100, Math.floor(entry.contentRect.width));
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      width.value = next;
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
  <div class="pdf-preview" :aria-busy="loading || painting">
    <p v-if="error" role="alert" class="pdf-message">{{ error }}</p>
    <p v-else-if="loading || painting" role="status" class="pdf-status">{{ i18n.t('common.loading') }}</p>
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
        @click="page--"
      >
        <Icon name="chevron-left" />
      </button>
      <span>{{ page }} / {{ document.pages }}</span>
      <button
        class="btn ghost icon-only"
        :disabled="page >= document.pages"
        :aria-label="i18n.t('library.nextPage')"
        @click="page++"
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
    <div ref="viewport" class="pdf-viewport" @wheel="wheel">
      <canvas
        v-if="document"
        v-show="painted"
        ref="canvas"
        role="img"
        :aria-label="i18n.t('library.pdfPage', { page })"
      />
    </div>
  </div>
</template>

<style scoped>
.pdf-status {
  position: absolute;
  top: 40px;
  left: 12px;
  z-index: 1;
  background: var(--bg);
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--fg-muted);
}
.pdf-preview {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.pdf-bookmarks {
  flex: none;
  max-height: 40%;
  overflow: auto;
  border-bottom: 1px solid var(--line);
  padding-block: 6px;
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
.pdf-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  font: 12px/1.5 var(--font);
}
.pdf-spacer {
  flex: 1;
}
.pdf-viewport {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  padding: 8px;
  background: var(--bg-sunken);
  border-radius: 10px;
}
canvas {
  display: block;
  margin: 0 auto;
  background: white;
}
.pdf-message {
  padding: 12px;
  color: var(--fg-muted);
}
</style>
