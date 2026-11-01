<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import Icon from '../../ui/components/Icon.vue';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const props = defineProps<{ src: string }>();
const document = shallowRef<PDFDocumentProxy>();
const canvas = ref<HTMLCanvasElement | null>(null),
  viewport = ref<HTMLElement | null>(null);
const page = ref(1),
  zoom = ref(1),
  width = ref(300),
  loading = ref(true),
  error = ref('');
type Bookmark = { title: string; depth: number; dest: string | unknown[] | null };
const bookmarks = ref<Bookmark[]>([]),
  outlineOpen = ref(false);
let jumpRevision = 0;
async function jump(bookmark: Bookmark) {
  const pdf = document.value,
    own = ++jumpRevision;
  if (!pdf || !bookmark.dest) return;
  try {
    const destination = typeof bookmark.dest === 'string' ? await pdf.getDestination(bookmark.dest) : bookmark.dest;
    if (!destination) return;
    const target = destination[0];
    const index = typeof target === 'number' ? target : await pdf.getPageIndex(target as { num: number; gen: number });
    if (document.value !== pdf || own !== jumpRevision || index < 0 || index >= pdf.numPages) return;
    page.value = index + 1;
    if (viewport.value) viewport.value.scrollTop = 0;
    outlineOpen.value = false;
  } catch {
    // A malformed bookmark must not prevent reading the document.
  }
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
  const next = Math.max(1, Math.min(pdf.numPages, page.value + (down ? 1 : -1)));
  wheelTotal = 0;
  if (next === page.value) return;
  lastTurn = now;
  page.value = next;
}
let task: RenderTask | undefined,
  epoch = 0;
watch(
  () => props.src,
  async (src, _, onCleanup) => {
    let alive = true;
    let destroy: (() => Promise<void>) | undefined;
    onCleanup(() => {
      alive = false;
      epoch++;
      task?.cancel();
      void destroy?.().catch(() => {});
    });
    document.value = undefined;
    bookmarks.value = [];
    outlineOpen.value = false;
    jumpRevision++;
    page.value = 1;
    zoom.value = 1;
    loading.value = true;
    error.value = '';
    try {
      const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (!alive) return;
      pdf.GlobalWorkerOptions.workerSrc = workerUrl;
      const resources = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href);
      const request = pdf.getDocument({
        disableAutoFetch: true,
        disableStream: true,
        url: src,
        useSystemFonts: true,
        cMapUrl: new URL('cmaps/', resources).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', resources).href,
        wasmUrl: new URL('wasm/', resources).href,
      });
      destroy = () => request.destroy();
      const loaded = await request.promise;
      if (alive) document.value = loaded;
      const outline = await loaded.getOutline().catch(() => null);
      if (!alive) return;
      const rows: Bookmark[] = [];
      function flatten(items: NonNullable<typeof outline>, depth = 0) {
        for (const item of items) {
          rows.push({ title: item.title, depth, dest: item.dest });
          flatten(item.items, depth + 1);
        }
      }
      if (outline) flatten(outline);
      bookmarks.value = rows;
    } catch (cause) {
      if (alive) error.value = describeError(cause).message;
    } finally {
      if (alive) loading.value = false;
    }
  },
  { immediate: true },
);

watch(
  [document, page, zoom, width, canvas],
  async () => {
    const own = ++epoch,
      previous = task;
    previous?.cancel();
    if (previous) await previous.promise.catch(() => {});
    const pdf = document.value,
      element = canvas.value;
    if (!pdf || !element || own !== epoch) return;
    try {
      const sheet = await pdf.getPage(page.value);
      if (own !== epoch) return;
      const base = sheet.getViewport({ scale: 1 });
      const view = sheet.getViewport({
        scale: Math.min((width.value / base.width) * zoom.value, 4096 / Math.max(base.width, base.height)),
      });
      const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (view.width * view.height)));
      element.width = Math.ceil(view.width * density);
      element.height = Math.ceil(view.height * density);
      element.style.width = `${view.width}px`;
      element.style.height = `${view.height}px`;
      task = sheet.render({ canvas: element, viewport: view, transform: [density, 0, 0, density, 0, 0] });
      await task.promise;
    } catch (cause) {
      if (own === epoch) error.value = describeError(cause).message;
    }
  },
  { flush: 'post' },
);
watch(page, () => {
  if (viewport.value) viewport.value.scrollTop = 0;
});
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width > 0) width.value = Math.max(100, entry.contentRect.width - 16);
  });
  if (viewport.value) observer.observe(viewport.value);
});
onBeforeUnmount(() => {
  epoch++;
  task?.cancel();
  observer?.disconnect();
});
</script>

<template>
  <div class="pdf-preview">
    <p v-if="error" role="alert" class="pdf-message">{{ error }}</p>
    <p v-else-if="loading" role="status" class="pdf-message">{{ i18n.t('common.loading') }}</p>
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
      <span>{{ page }} / {{ document.numPages }}</span>
      <button
        class="btn ghost icon-only"
        :disabled="page >= document.numPages"
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
        :disabled="!bookmark.dest"
        :style="{ paddingLeft: `${8 + Math.min(bookmark.depth, 8) * 12}px` }"
        @click="jump(bookmark)"
      >
        {{ bookmark.title }}
      </button>
    </nav>
    <div ref="viewport" class="pdf-viewport" @wheel="wheel">
      <canvas v-if="document" ref="canvas" role="img" :aria-label="i18n.t('library.pdfPage', { page })" />
    </div>
  </div>
</template>

<style scoped>
.pdf-preview {
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
