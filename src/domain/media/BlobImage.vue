<script setup lang="ts">
// Blob images use bounded scene-specific WebP previews; opening details fetches
// the original independently so virtualized thumbnails can unmount safely.
import { i18n } from '../../core/i18n/index.ts';
import ImageFrame from '../../ui/components/ImageFrame.vue';
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue';
import { apiFetch, needsAccessToken } from '../../core/api/client.ts';
import { imagePreviewUrl } from '../../core/api/endpoints.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { acquireImageLoad } from '../../core/util/imageLoad.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { useOpenImage } from './useOpenImage.ts';

const props = withDefaults(
  defineProps<{
    src: string;
    dimensions?: readonly number[];
    placeholder?: string;
    zoom?: boolean;
    previewWidth?: 384 | 768 | 1536;
  }>(),
  {
    zoom: true,
    previewWidth: 768,
  },
);
const attrs = useAttrs();
const emit = defineEmits<{ load: [event: Event] }>();
const element = ref<InstanceType<typeof ImageFrame>>();
const failed = ref(false);
const visible = ref(attrs.loading !== 'lazy');
const url = ref('');
const preview = computed(() => imagePreviewUrl(props.src, props.previewWidth, prefs.originalImages.value));
const openImage = useOpenImage();
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
  if (element.value) observer.observe(element.value.$el);
});
function onOpen() {
  if (props.zoom) void openImage(props.src, String(attrs.alt ?? ''));
}
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
    failed.value = false;
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
        failed.value = !url.value;
        return;
      }
      const version = response.headers.get('etag') ?? undefined;
      if (cached?.value && version && cached.version === version) {
        await response.body?.cancel();
        return;
      }
      const bytes = await response.blob();
      if (!controller.signal.aborted) {
        if (key) previewCache.set(key, bytes, version);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        url.value = objectUrl = URL.createObjectURL(bytes);
      }
    } catch {
      if (!controller.signal.aborted) failed.value = !url.value;
    } finally {
      release?.();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<template>
  <ImageFrame
    ref="element"
    :source="src"
    :url="url"
    :dimensions="dimensions"
    :placeholder="placeholder"
    :failed="failed"
    :alt="String(attrs.alt ?? '')"
    :aria-label="zoom ? String(attrs.alt || i18n.t('chat.image')) : undefined"
    :class="{ zoomable: zoom }"
    :tabindex="zoom ? 0 : undefined"
    :role="zoom ? 'button' : undefined"
    @click="onOpen"
    @load="emit('load', $event)"
    @keydown.enter.prevent="onOpen"
    @keydown.space.prevent="onOpen"
  />
</template>
