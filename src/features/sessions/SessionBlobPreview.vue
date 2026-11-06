<script setup lang="ts">
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import { mediaPlayback } from '../../domain/media/requests.ts';
import LoadingState from '../../ui/components/LoadingState.vue';
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { BlobMetadata, LibraryBlob } from '../../core/api/types.ts';
import { blobMetadata, blobUrl } from '../../core/api/endpoints.ts';
import { absUrl, apiFetch } from '../../core/api/client.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import Icon from '../../ui/components/Icon.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import VideoPlayer from '../../domain/media/VideoPlayer.vue';
import ImagePreview from '../../domain/media/ImagePreview.vue';
import { blobKind } from './libraryFiles.ts';
import type { BlobLocation } from '../../core/blobMentions.ts';

const focusReference = ref<import('../../core/replyReferences.ts').ReplyReference>();
const fileLocation = ref<BlobLocation>();
let pendingTime: number | undefined;
function seekMention() {
  const media = player.value;
  if (pendingTime === undefined || !media || media.readyState < 1 || !Number.isFinite(media.duration)) return;
  media.currentTime = Math.max(0, Math.min(pendingTime, media.duration));
  pendingTime = undefined;
}
defineExpose({
  locate: (reference: import('../../core/replyReferences.ts').ReplyReference) => {
    focusReference.value = { ...reference };
  },
  locateFile: (location: BlobLocation) => {
    focusReference.value = undefined;
    fileLocation.value = { ...location };
    pendingTime = location.time;
    seekMention();
  },
});
const PdfPreview = defineAsyncComponent(() => import('../../domain/media/PdfPreview.vue'));
const props = defineProps<{ session: string; blob: LibraryBlob; name: string; toolbar?: HTMLElement }>();
const emit = defineEmits<{ metadata: [metadata: BlobMetadata] }>();
const saved = useWorkspaceState(
  'file',
  () => `${props.session}/${props.blob.id}`,
  { time: 0, scroll: 0 },
  { throttleMs: () => (['video', 'audio'].includes(blobKind(props.blob)) ? 5000 : undefined) },
);
function restorePlayback() {
  if (kind.value === 'video') checkVideo();
  if (player.value && Number.isFinite(player.value.duration))
    player.value.currentTime = Math.max(0, Math.min(saved.value.time, player.value.duration));
  seekMention();
}
function rememberPlayback() {
  if (player.value && !player.value.seeking && player.value.readyState > 0) saved.value.time = player.value.currentTime;
}
function savePlayback() {
  rememberPlayback();
  saved.flush();
}
window.addEventListener('pagehide', savePlayback);
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
const metadata = shallowRef<BlobMetadata>();
const kind = computed(() => blobKind({ ...props.blob, ...metadata.value }));
const player = ref<HTMLMediaElement | null>(null);
onBeforeUnmount(() => {
  player.value?.pause();
  savePlayback();
  window.removeEventListener('pagehide', savePlayback);
});
watch(usePageActivity(), (active) => {
  if (!active) player.value?.pause();
});
const source = ref(''),
  text = ref(''),
  error = ref('');
const loading = ref(false),
  truncated = ref(false),
  revision = ref(0);
let loadController: AbortController | undefined;
let checking = false;
watch(
  [() => props.session, () => props.blob.id, revision],
  async (_, __, onCleanup) => {
    const controller = new AbortController();
    loadController = controller;
    checking = false;
    metadata.value = undefined;
    onCleanup(() => controller.abort());
    source.value = '';
    text.value = '';
    error.value = '';
    truncated.value = false;
    loading.value = true;
    try {
      const info = await blobMetadata(`${props.session}/${props.blob.id}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      metadata.value = info;
      emit('metadata', info);
      if (kind.value === 'text') {
        if (metadata.value.byte_count === 0) return;
        const response = await apiFetch(blobUrl(`${props.session}/${props.blob.id}`), {
          signal: controller.signal,
          headers: { Range: 'bytes=0-262143' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        truncated.value = metadata.value.byte_count > bytes.byteLength;
        text.value = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: truncated.value });
      } else if (kind.value !== 'file' && kind.value !== 'pdf') {
        const grant = await mediaPlayback(props.session, props.blob.id, { signal: controller.signal }, info.version);
        if (!controller.signal.aborted) source.value = absUrl(grant.path);
      }
    } catch (cause) {
      if (!controller.signal.aborted) void handleLoadFailure(cause);
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
    void handleLoadFailure(i18n.t('library.videoUnsupported'));
  }
}
async function handleLoadFailure(cause?: unknown) {
  const controller = loadController;
  if (!controller || controller.signal.aborted || checking) return;
  checking = true;
  const code = player.value?.error?.code;
  let message = cause
    ? describeError(cause).message
    : i18n.t(
        kind.value === 'video' && (code === 3 || code === 4) ? 'library.videoUnsupported' : 'library.previewFailed',
      );
  if (!metadata.value) {
    checking = false;
    error.value = message;
    return;
  }
  try {
    const latest = await blobMetadata(`${props.session}/${props.blob.id}`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    // Revalidate only after a load error. The new version becomes the baseline
    // on reload, so a corrupt or unsupported file cannot cause a retry loop.
    if (metadata.value?.version && latest.version !== metadata.value.version) {
      savePlayback();
      revision.value++;
      return;
    }
  } catch (error) {
    message = describeError(error).message;
  } finally {
    if (loadController === controller) checking = false;
  }
  if (!controller.signal.aborted) error.value = message;
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
        :reference="{ session, blob: blob.id }"
        :focus="focusReference"
        :toolbar="toolbar"
        @error="handleLoadFailure"
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
        @pause="savePlayback"
        @seeked="savePlayback"
        @error="handleLoadFailure"
      />
      <div v-else-if="kind === 'audio' && source" class="audio-preview">
        <Icon name="audio" :size="64" /><audio
          ref="player"
          :key="source"
          :src="source"
          controls
          @loadedmetadata="restorePlayback"
          @timeupdate="rememberPlayback"
          @pause="savePlayback"
          @seeked="savePlayback"
          preload="metadata"
          @error="handleLoadFailure"
        />
      </div>
      <PdfPreview
        v-else-if="kind === 'pdf'"
        :session="session"
        :blob="blob.id"
        :name="name"
        :focus="focusReference"
        :location="fileLocation"
        :toolbar="toolbar"
        @error="handleLoadFailure"
      />
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
