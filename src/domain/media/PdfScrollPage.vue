<script setup lang="ts">
import RegionSelection from './RegionSelection.vue';
import type { ReplyReference } from '../../core/replyReferences.ts';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { renderPdfPage } from './nativePdf.ts';
import { pdfPage } from './requests.ts';
import { acquireImageLoad } from '../../core/util/imageLoad.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { i18n } from '../../core/i18n/index.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';

const props = defineProps<{
  session: string;
  blob: string;
  version: string;
  page: number;
  width: number;
  resizing?: boolean;
  name?: string;
  focus?: ReplyReference;
}>();
const emit = defineEmits<{ measured: [ratio: number]; error: [cause: unknown] }>();
const host = shallowRef<HTMLElement>();
const active = usePageActivity();
const paintedWidth = ref(0);
const scale = computed(() => (paintedWidth.value ? props.width / paintedWidth.value : 1));
const canvas = shallowRef<HTMLCanvasElement>();
const dimensions = shallowRef<{ width: number; height: number }>();
let rendered: Awaited<ReturnType<typeof renderPdfPage>> | undefined;
let lastPaint = '';
onBeforeUnmount(() => {
  void rendered?.dispose();
});
const loading = ref(true),
  error = ref(''),
  revision = ref(0);
watch(
  [
    () => props.session,
    () => props.blob,
    () => props.version,
    () => props.page,
    () => props.width,
    () => props.resizing,
    host,
    active,
    revision,
  ],
  async (_, __, cleanup) => {
    const controller = new AbortController();
    cleanup(() => {
      controller.abort();
    });
    const element = host.value;
    if (!element || !active.value || props.resizing) return;
    const width = props.width;
    const key = `${props.session}:${props.blob}:${props.version}:${props.page}:${width}:${revision.value}`;
    if (key === lastPaint && rendered) return;
    loading.value = true;
    error.value = '';
    let release: (() => void) | undefined;
    try {
      release = await acquireImageLoad(controller.signal);
      const bytes = await pdfPage(props.session, props.blob, props.page, controller.signal, props.version);
      const result = await renderPdfPage(bytes, width, controller.signal, true);
      if (controller.signal.aborted) {
        await result.dispose();
        return;
      }
      void rendered?.dispose();
      rendered = result;
      canvas.value = result.canvas;
      dimensions.value = result.dimensions;
      lastPaint = key;
      paintedWidth.value = width;
      element.replaceChildren(result.surface);
      emit('measured', result.dimensions.height / result.dimensions.width);
    } catch (cause) {
      if (!controller.signal.aborted) {
        error.value = describeError(cause).message;
        emit('error', cause);
      }
    } finally {
      release?.();
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { flush: 'post', immediate: true },
);
</script>

<template>
  <div class="pdf-scroll-page" :aria-busy="loading" role="group" :aria-label="i18n.t('library.pdfPage', { page })">
    <div
      ref="host"
      class="page-surface"
      :style="{ width: `${paintedWidth || width}px`, transform: `scale(${scale})` }"
    />
    <RegionSelection
      :target="canvas"
      :session="session"
      :blob="blob"
      :page="page"
      :name="name ?? blob"
      :dimensions="dimensions"
      :focus="focus"
    />
    <div v-if="error" class="page-state" role="alert">
      <span>{{ error }}</span>
      <button class="btn sm" @click="revision++">{{ i18n.t('common.retry') }}</button>
    </div>
    <span v-else-if="loading && !paintedWidth" class="page-state">{{ i18n.t('common.loading') }}</span>
  </div>
</template>

<style scoped>
.pdf-scroll-page {
  position: relative;
  width: 100%;
  height: 100%;
  background: white;
  /* The old layout box must not enlarge the scroll range while zooming out. */
  overflow: clip;
}
.page-surface {
  /* Keep the old page's centering box at its painted width until the repaint swaps in. */
  transform-origin: top left;
}
.page-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  color: #555;
  font-size: 12px;
}
</style>
