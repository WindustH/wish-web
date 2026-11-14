<script setup lang="ts">
// Blob images use bounded scene-specific WebP previews; opening details fetches
// the original independently so virtualized thumbnails can unmount safely.
import { toast } from '../../ui/toast.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue';
import { apiFetch, needsAccessToken } from '../../core/api/client.ts';
import { imagePreviewUrl } from '../../core/api/endpoints.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { acquireImageLoad } from '../../core/util/imageLoad.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { openImageLightbox } from '../../ui/imageLightbox.ts';

const props = withDefaults(defineProps<{ src: string; zoom?: boolean; previewWidth?: 384 | 768 | 1536 }>(), {
  zoom: true,
  previewWidth: 768,
});
const attrs = useAttrs();
const element = ref<HTMLImageElement>();
const visible = ref(attrs.loading !== 'lazy');
const url = ref('');
const preview = computed(() => imagePreviewUrl(props.src, props.previewWidth, prefs.originalImages.value));
let loadedOriginal: { src: string; bytes: Blob } | undefined;
let observer: IntersectionObserver | undefined;
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
  if (element.value) observer.observe(element.value);
});
const opening = ref(false);
let originalController: AbortController | undefined;
async function onOpen() {
  if (!props.zoom || opening.value) return;
  const src = props.src,
    alt = String(attrs.alt ?? '');
  if (loadedOriginal?.src === src) {
    openImageLightbox(src, alt, loadedOriginal.bytes);
    return;
  }
  if (!needsAccessToken(src)) {
    openImageLightbox(src, alt);
    return;
  }
  opening.value = true;
  const request = (originalController = new AbortController());
  try {
    const response = await apiFetch(src, { signal: request.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.blob();
    if (!request.signal.aborted) openImageLightbox(src, alt, bytes);
  } catch (error) {
    if (!request.signal.aborted) toast(describeError(error).message);
  } finally {
    if (originalController === request) opening.value = false;
  }
}
watch(
  () => props.src,
  () => {
    originalController?.abort();
    originalController = undefined;
    opening.value = false;
  },
);
watch(
  [preview, visible],
  async ([src, shown], _, onCleanup) => {
    const controller = new AbortController();
    let objectUrl = '';
    onCleanup(() => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    url.value = '';
    loadedOriginal = undefined;
    if (!shown) return;
    if (src === props.src && !needsAccessToken(src)) {
      url.value = src;
      return;
    }
    // Keep only bounded preview images, never original uploads. Paint first, then
    // let HTTP validation detect edits to mutable local links without a blank frame.
    const key = src !== props.src ? `image:${src}` : undefined;
    const cached = key ? previewCache.entry(key) : undefined;
    if (cached?.value) url.value = objectUrl = URL.createObjectURL(cached.value);
    let release: (() => void) | undefined;
    try {
      release = await acquireImageLoad(controller.signal);
      const response = await apiFetch(src, { signal: controller.signal });
      controller.signal.throwIfAborted();
      if (!response.ok) {
        if ([403, 404, 410].includes(response.status)) {
          if (key) previewCache.set(key, null);
          url.value = '';
        }
        return;
      }
      const version = response.headers.get('etag') ?? undefined;
      if (cached?.value && version && cached.version === version) {
        await response.body?.cancel();
        return;
      }
      const bytes = await response.blob();
      if (!controller.signal.aborted) {
        if (src === props.src) loadedOriginal = { src, bytes };
        if (key) previewCache.set(key, bytes, version);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        url.value = objectUrl = URL.createObjectURL(bytes);
      }
    } catch {
      /* Keep the original available through the detail action. */
    } finally {
      release?.();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  observer?.disconnect();
  originalController?.abort();
});
</script>

<template>
  <img
    ref="element"
    :src="url || undefined"
    :class="{ zoomable: zoom, 'image-opening': opening }"
    :aria-busy="opening"
    :tabindex="zoom ? 0 : undefined"
    :role="zoom ? 'button' : undefined"
    @click="onOpen"
    @keydown.enter.prevent="onOpen"
    @keydown.space.prevent="onOpen"
  />
</template>

<style scoped>
.image-opening {
  cursor: progress;
  opacity: 0.65;
}
</style>
