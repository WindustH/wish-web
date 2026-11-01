<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { imagePreviewUrl } from '../../core/api/endpoints.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { cfg } from '../../core/config.ts';
import { acquireImageLoad } from '../../core/util/imageLoad.ts';
import { apiFetch, needsAccessToken } from '../../core/api/client.ts';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ src: string; mime: string; path: string }>();
const url = ref(''),
  error = ref(false),
  size = ref(''),
  zoom = ref(false);
const surface = ref<HTMLElement>();
const visible = ref(false);
let observer: IntersectionObserver | undefined;
let releaseImage = () => {};
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    visible.value = true;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        visible.value = true;
        observer?.disconnect();
      }
    },
    { rootMargin: '200px' },
  );
  if (surface.value) observer.observe(surface.value);
});
onBeforeUnmount(() => observer?.disconnect());
function failed() {
  error.value = true;
  releaseImage();
}
watch(
  () => [imagePreviewUrl(props.src, 768, zoom.value || prefs.originalImages.value), visible.value] as const,
  async ([src, ready], _, onCleanup) => {
    const controller = new AbortController();
    let objectUrl = '';
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let active = true;
    const release = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    };
    releaseImage = release;
    onCleanup(() => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
      release();
    });
    url.value = '';
    error.value = false;
    size.value = '';
    if (!ready) return;
    if (src === props.src && !needsAccessToken(src)) {
      url.value = src;
      return;
    }
    let releasePermit: (() => void) | undefined;
    try {
      releasePermit = await acquireImageLoad(controller.signal);
      controller.signal.throwIfAborted();
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, cfg.api.requestTimeoutMs);
      const response = await apiFetch(src, { signal: controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(
        new Blob([bytes], {
          type:
            response.headers.get('content-type') || (props.mime && !props.mime.includes('*') ? props.mime : '') || '',
        }),
      );
      url.value = objectUrl;
    } catch {
      if (active && (timedOut || !controller.signal.aborted)) error.value = true;
    } finally {
      clearTimeout(timeout);
      releasePermit?.();
    }
  },
  { immediate: true },
);
watch(
  () => props.src,
  () => {
    zoom.value = false;
  },
);
function loaded(event: Event) {
  const img = event.target as HTMLImageElement;
  size.value = `${img.naturalWidth} × ${img.naturalHeight}`;
}
</script>
<template>
  <figure ref="surface" class="tool-image">
    <button
      v-if="url && !error"
      class="image-surface"
      :class="{ zoom }"
      :aria-label="tr('切换原始尺寸', 'Toggle original size')"
      @click="zoom = !zoom"
    >
      <img :src="url" :alt="path" loading="lazy" decoding="async" @load="loaded" @error="failed" />
    </button>
    <p v-if="error" role="status">{{ tr('图片暂时无法加载。', 'Image could not be loaded.') }}</p>
    <p v-else-if="!url">{{ tr('正在读取图片…', 'Loading image…') }}</p>
    <figcaption>
      <span>{{ path }}</span
      ><span>{{ size }}</span>
    </figcaption>
  </figure>
</template>
<style scoped>
.tool-image {
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  min-width: 0;
}
.image-surface {
  display: block;
  width: 100%;
  max-height: 65dvh;
  overflow: auto;
  padding: 12px;
  border: 0;
  background: var(--bg-inset);
  cursor: zoom-in;
  text-align: center;
}
.image-surface img {
  display: block;
  max-width: 100%;
  max-height: 60dvh;
  object-fit: contain;
  margin: auto;
}
.image-surface.zoom {
  cursor: zoom-out;
}
.zoom img {
  max-width: none;
  max-height: none;
}
figcaption {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--fg-subtle);
}
figcaption span:first-child {
  overflow-wrap: anywhere;
  min-width: 0;
}
figcaption span:last-child {
  white-space: nowrap;
}
p {
  padding: 12px;
  font-size: 13px;
}
</style>
