<script setup lang="ts">
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import { mediaPlayback } from '../../domain/media/requests.ts';
import LoadingState from '../../ui/components/LoadingState.vue';
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
import type { LibraryBlob } from '../../core/api/types.ts';
import { blobUrl } from '../../core/api/endpoints.ts';
import { absUrl, apiFetch } from '../../core/api/client.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import Icon from '../../ui/components/Icon.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import VideoPlayer from '../../domain/media/VideoPlayer.vue';
import ImagePreview from '../../domain/media/ImagePreview.vue';
import { blobKind } from './libraryFiles.ts';

const PdfPreview = defineAsyncComponent(() => import('../../domain/media/PdfPreview.vue'));
const props = defineProps<{ session: string; blob: LibraryBlob; name: string }>();
const saved = useWorkspaceState('file', () => `${props.session}/${props.blob.id}`, { time: 0, scroll: 0 });
function restorePlayback() {
  if (kind.value === 'video') checkVideo();
  if (player.value && Number.isFinite(player.value.duration))
    player.value.currentTime = Math.max(0, Math.min(saved.value.time, player.value.duration));
}
function rememberPlayback() {
  if (player.value && !player.value.seeking && player.value.readyState > 0) saved.value.time = player.value.currentTime;
}
const textViewport = ref<HTMLElement>();
watch(
  textViewport,
  (element) => {
    if (element) element.scrollTop = Math.max(0, saved.value.scroll);
  },
  { flush: 'post' },
);
function rememberText() {
  if (textViewport.value?.clientHeight) saved.value.scroll = textViewport.value.scrollTop;
}
const kind = computed(() => blobKind(props.blob));
const player = ref<HTMLMediaElement | null>(null);
onBeforeUnmount(() => player.value?.pause());
watch(usePageActivity(), (active) => {
  if (!active) player.value?.pause();
});
const source = ref(''),
  text = ref(''),
  error = ref('');
const loading = ref(false),
  truncated = ref(false),
  revision = ref(0);
watch(
  () => [props.session, props.blob.id, revision.value] as const,
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    source.value = '';
    text.value = '';
    error.value = '';
    truncated.value = false;
    loading.value = true;
    try {
      if (kind.value === 'text') {
        if (props.blob.byte_count === 0) return;
        const response = await apiFetch(blobUrl(`${props.session}/${props.blob.id}`), {
          signal: controller.signal,
          headers: { Range: 'bytes=0-262143' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        truncated.value = props.blob.byte_count > bytes.byteLength;
        text.value = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: truncated.value });
      } else if (kind.value !== 'file' && kind.value !== 'pdf') {
        const grant = await mediaPlayback(props.session, props.blob.id, { signal: controller.signal });
        if (!controller.signal.aborted) source.value = absUrl(grant.path);
      }
    } catch (cause) {
      if (!controller.signal.aborted) error.value = describeError(cause).message;
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);
function checkVideo() {
  const video = player.value;
  if (video instanceof HTMLVideoElement && video.readyState >= 1 && (!video.videoWidth || !video.videoHeight)) {
    video.pause();
    error.value = i18n.t('library.videoUnsupported');
  }
}
function failed() {
  const code = player.value?.error?.code;
  error.value = i18n.t(
    kind.value === 'video' && (code === 3 || code === 4) ? 'library.videoUnsupported' : 'library.previewFailed',
  );
}
</script>

<template>
  <div class="blob-preview" :class="`blob-preview-${kind}`" :aria-label="name">
    <LoadingState v-if="loading" :label="i18n.t('common.loading')" />
    <div v-else-if="error" class="library-state" role="alert">
      <p>{{ error }}</p>
      <button class="btn sm" @click="revision++">{{ i18n.t('common.retry') }}</button>
    </div>
    <template v-else>
      <ImagePreview
        v-if="kind === 'image' && source"
        :src="source"
        :alt="name"
        :state-key="`${session}/${blob.id}`"
        @error="failed"
      />
      <VideoPlayer
        v-else-if="kind === 'video' && source"
        @ready="player = $event"
        :label="name"
        :key="source"
        :src="source"
        @loadedmetadata="restorePlayback"
        @loadeddata="checkVideo"
        @playing="checkVideo"
        @timeupdate="rememberPlayback"
        @pause="rememberPlayback"
        @error="failed"
      />
      <div v-else-if="kind === 'audio' && source" class="audio-preview">
        <Icon name="audio" :size="64" /><audio
          ref="player"
          :key="source"
          :src="source"
          controls
          @loadedmetadata="restorePlayback"
          @timeupdate="rememberPlayback"
          @pause="rememberPlayback"
          preload="metadata"
          @error="failed"
        />
      </div>
      <PdfPreview v-else-if="kind === 'pdf'" :session="session" :blob="blob.id" />
      <div v-else-if="kind === 'text'" ref="textViewport" class="text-preview" @scroll.passive="rememberText">
        <pre>{{ text }}</pre>
        <p v-if="truncated" class="muted">{{ i18n.t('library.truncated') }}</p>
      </div>
      <div v-else class="library-state">
        <Icon name="paperclip" :size="40" />
        <p>{{ i18n.t('library.noPreview') }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.blob-preview {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 12px;
}
.blob-preview-pdf {
  padding: 0 6px 6px;
}
.blob-preview-image,
.blob-preview-video {
  align-items: center;
  justify-content: center;
}
.blob-preview > img,
.blob-preview > video {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 10px;
}
.audio-preview {
  width: 100%;
  margin: auto;
  display: grid;
  justify-items: center;
  gap: 32px;
  color: var(--fg-subtle);
}
audio {
  width: 100%;
}
.text-preview {
  width: 100%;
  overflow: auto;
  user-select: text;
}
.text-preview pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
  font: 13px/1.7 var(--mono);
}
.library-state {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  color: var(--fg-muted);
}
.library-state p {
  margin: 0;
}
.muted {
  color: var(--fg-muted);
  font-size: 12px;
}
</style>
