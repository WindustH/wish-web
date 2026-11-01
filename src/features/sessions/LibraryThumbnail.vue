<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { LibraryBlob } from '../../core/api/types.ts';
import { blobUrl, mediaPlayback } from '../../core/api/endpoints.ts';
import { absUrl } from '../../core/api/client.ts';
import { pdfThumbnail } from '../../domain/media/pdfThumbnail.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { audioCover } from '../../domain/media/audioCover.ts';
import { acquireImageLoad } from '../../domain/media/imageLoad.ts';
import ApiImage from '../../ui/components/ApiImage.vue';
import Icon from '../../ui/components/Icon.vue';
import { blobIcon, blobKind } from './libraryFiles.ts';

const props = defineProps<{ session: string; blob: LibraryBlob }>();
const kind = computed(() => blobKind(props.blob));
const surface = ref<HTMLElement>(),
  visible = ref(false),
  source = ref('');
let observer: IntersectionObserver | undefined;
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        visible.value = true;
        observer?.disconnect();
      }
    },
    { rootMargin: '100px' },
  );
  if (surface.value) observer.observe(surface.value);
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => [props.session, props.blob.id, visible.value] as const,
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    let objectUrl = '';
    onCleanup(() => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    source.value = '';
    if (!visible.value || !['audio', 'video', 'pdf'].includes(kind.value)) return;
    const key = absUrl(blobUrl(`${props.session}/${props.blob.id}`));
    const cacheable = !props.blob.linked && ['audio', 'pdf'].includes(kind.value);
    const cached = cacheable ? previewCache.get(key) : undefined;
    if (cached !== undefined) {
      if (cached) source.value = objectUrl = URL.createObjectURL(cached);
      return;
    }
    let release: (() => void) | undefined;
    try {
      release = await acquireImageLoad(controller.signal);
      if (kind.value === 'audio') {
        const cover = await audioCover(
          blobUrl(`${props.session}/${props.blob.id}`),
          props.blob.byte_count,
          props.blob.mime_type,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          if (cacheable) previewCache.set(key, cover);
          if (cover) source.value = objectUrl = URL.createObjectURL(cover);
        }
      } else if (kind.value === 'pdf') {
        const cover = await pdfThumbnail(props.session, props.blob.id, controller.signal);
        if (!controller.signal.aborted) {
          if (cacheable) previewCache.set(key, cover);
          if (cover) source.value = objectUrl = URL.createObjectURL(cover);
        }
      } else {
        const grant = await mediaPlayback(props.session, props.blob.id, { signal: controller.signal });
        if (!controller.signal.aborted) source.value = absUrl(grant.path);
      }
    } catch {
      // Thumbnails are optional: unsupported codecs and missing covers retain the type icon.
    } finally {
      release?.();
    }
  },
  { immediate: true },
);
function seekFrame(event: Event) {
  const video = event.target as HTMLVideoElement;
  if (Number.isFinite(video.duration)) video.currentTime = Math.min(0.1, video.duration / 2);
}
</script>

<template>
  <span ref="surface" class="library-thumbnail" :class="kind">
    <ApiImage v-if="kind === 'image'" :src="blobUrl(`${session}/${blob.id}`)" :zoom="false" alt="" loading="lazy" />
    <video
      v-else-if="kind === 'video' && source"
      :src="source"
      muted
      playsinline
      preload="metadata"
      tabindex="-1"
      aria-hidden="true"
      @loadedmetadata="seekFrame"
      @error="source = ''"
    />
    <img v-else-if="(kind === 'audio' || kind === 'pdf') && source" :src="source" alt="" @error="source = ''" />
    <Icon v-else :name="blobIcon(kind)" :size="kind === 'audio' ? 48 : 32" />
    <span v-if="kind === 'video'" class="library-play"><Icon name="play" :size="24" /></span>
    <Icon v-if="kind === 'pdf'" name="file-pdf" class="library-pdf-icon" :size="26" />
  </span>
</template>

<style scoped>
.library-thumbnail {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-sunken);
  color: var(--fg-subtle);
  overflow: hidden;
}
.library-thumbnail :deep(img),
video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.library-thumbnail.pdf img {
  object-fit: contain;
}
.library-play {
  position: absolute;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #0008;
  color: white;
}
.library-pdf-icon {
  position: absolute;
  right: 8px;
  bottom: 8px;
  color: var(--accent);
}
</style>
