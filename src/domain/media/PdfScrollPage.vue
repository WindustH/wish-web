<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { renderPdfPage } from './nativePdf.ts';
import { pdfPage } from './requests.ts';
import { acquireImageLoad } from '../../core/util/imageLoad.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { i18n } from '../../core/i18n/index.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';

const props = defineProps<{ session: string; blob: string; version: string; page: number; width: number }>();
const emit = defineEmits<{ measured: [ratio: number] }>();
const host = shallowRef<HTMLElement>();
const active = usePageActivity();
const paintedWidth = ref(0);
const scale = computed(() => (paintedWidth.value ? props.width / paintedWidth.value : 1));
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
    if (!element || !active.value) return;
    const key = `${props.session}:${props.blob}:${props.version}:${props.page}:${props.width}:${revision.value}`;
    if (key === lastPaint && rendered) return;
    loading.value = true;
    error.value = '';
    let release: (() => void) | undefined;
    try {
      release = await acquireImageLoad(controller.signal);
      const bytes = await pdfPage(props.session, props.blob, props.page, controller.signal, props.version);
      const result = await renderPdfPage(bytes, props.width, controller.signal, true);
      if (controller.signal.aborted) {
        await result.dispose();
        return;
      }
      void rendered?.dispose();
      rendered = result;
      lastPaint = key;
      paintedWidth.value = props.width;
      element.replaceChildren(result.surface);
      emit('measured', parseFloat(result.surface.style.height) / props.width);
    } catch (cause) {
      if (!controller.signal.aborted) error.value = describeError(cause).message;
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
    <div ref="host" class="page-surface" :style="{ transform: `scale(${scale})` }" />
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
}
.page-surface {
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
