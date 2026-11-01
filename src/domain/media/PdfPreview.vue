<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
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
    <div ref="viewport" class="pdf-viewport">
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
