<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { LibraryBlob } from '../../core/api/types.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import { previewCache } from '../../core/util/previewCache.ts';
import { thumbnail, thumbnailKey } from '../../domain/media/thumbnail.ts';
import { textThumbnail, textThumbnailKey } from '../../domain/media/textThumbnail.ts';
import LibraryDocumentThumbnail from './LibraryDocumentThumbnail.vue';
import LibraryWebsiteThumbnail from './LibraryWebsiteThumbnail.vue';
import BlobImage from '../../domain/media/BlobImage.vue';
import Icon from '../../ui/components/Icon.vue';
import { blobIcon, blobKind } from './libraryFiles.ts';

const props = defineProps<{ session: string; blob: LibraryBlob }>();
const kind = computed(() => blobKind(props.blob));
const surface = ref<HTMLElement>(),
  visible = ref(false),
  source = ref(''),
  text = ref('');
let observer: IntersectionObserver | undefined;
let objectUrl = '',
  currentKey = '';
let displayed: Blob | null | undefined;
function display(bytes: Blob | null | undefined) {
  if (displayed === bytes) return;
  displayed = bytes;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  source.value = objectUrl = bytes ? URL.createObjectURL(bytes) : '';
}
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
    { rootMargin: '100px' },
  );
  if (surface.value) observer.observe(surface.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
watch(
  () => [props.session, props.blob, visible.value] as const,
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const readsText = kind.value === 'text' || kind.value === 'website';
    const key = readsText ? textThumbnailKey(props.session, props.blob.id) : thumbnailKey(props.session, props.blob);
    if (currentKey !== key) {
      currentKey = key;
      display(undefined);
      text.value = '';
    }
    if (props.blob.available === false) {
      display(undefined);
      text.value = '';
      return;
    }
    const cached = previewCache.get(key);
    if (readsText) {
      if (cached) {
        const prefix = await cached.text();
        if (controller.signal.aborted) return;
        text.value = prefix;
      }
      if (!visible.value) return;
      try {
        const prefix = await textThumbnail(props.session, props.blob, controller.signal);
        if (!controller.signal.aborted) text.value = prefix;
      } catch {
        // Unavailable or non-UTF-8 text retains its file icon or last good preview.
      }
      return;
    }
    if (cached !== undefined) display(cached);
    if (!visible.value || !['audio', 'video', 'pdf'].includes(kind.value)) return;
    try {
      const cover = await thumbnail(props.session, props.blob, controller.signal);
      if (!controller.signal.aborted) display(cover);
    } catch {
      // A transient validation failure must not discard the last good cover.
    }
  },
  { immediate: true },
);
</script>

<template>
  <span ref="surface" class="library-thumbnail" :class="[kind, { 'has-document': kind === 'text' && text }]">
    <LibraryWebsiteThumbnail
      v-if="kind === 'website'"
      :descriptor="text"
      :name="blob.display_name || blob.name || undefined"
    />
    <LibraryDocumentThumbnail
      v-else-if="kind === 'text' && text"
      :text="text"
      :name="blob.name || blob.local_path || ''"
      :mime="blob.mime_type"
    />
    <BlobImage
      v-else-if="kind === 'image' && blob.available !== false"
      :src="blobUrl(`${session}/${blob.id}`)"
      :zoom="false"
      :preview-width="384"
      alt=""
      loading="lazy"
    />
    <img
      v-else-if="['audio', 'video', 'pdf'].includes(kind) && source"
      :src="source"
      alt=""
      @error="display(undefined)"
    />
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
.library-thumbnail :deep(.image-frame),
.library-thumbnail :deep(img),
video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.library-thumbnail.has-document {
  border: 0;
  background: none;
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
