<script setup lang="ts">
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import { mediaPlayback } from '../../domain/media/requests.ts';
import LoadingState from '../../ui/components/LoadingState.vue';
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { BlobMetadata, LibraryBlob } from '../../core/api/types.ts';
import { blobMetadata, blobUrl } from '../../core/api/endpoints.ts';
import WebsitePreview from './WebsitePreview.vue';
import { absUrl } from '../../core/api/client.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import Icon from '../../ui/components/Icon.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useDocumentVisible } from '../../ui/composables/useDocumentVisible.ts';
import VideoPlayer from '../../domain/media/VideoPlayer.vue';
import ImagePreview from '../../domain/media/ImagePreview.vue';
import { SourcePages, sourcePageBytes } from '../../domain/media/sourcePages.ts';
import SourcePreview from '../../domain/media/SourcePreview.vue';
import { sourcePreviewKind } from '../../ui/codeLanguage.ts';
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
const PdfPreview = defineAsyncComponent(() => import('../../domain/media/PdfPreview.vue'));
const props = defineProps<{ session: string; blob: LibraryBlob; name: string; toolbar?: HTMLElement }>();
const emit = defineEmits<{ metadata: [metadata: BlobMetadata] }>();
const saved = useWorkspaceState(
  'file',
  () => `${props.session}/${props.blob.id}`,
  { time: 0, scroll: 0, previewScroll: 0 },
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
const metadata = shallowRef<BlobMetadata>();
const sourceMode = ref<string>();
const sourcePreview = ref<InstanceType<typeof SourcePreview>>();
const kind = computed(() =>
  (metadata.value?.mime_type ?? props.blob.mime_type) === 'application/vnd.wish.website'
    ? 'website'
    : sourcePreviewKind(props.blob.name || props.name, metadata.value?.mime_type ?? props.blob.mime_type)
      ? 'text'
      : blobKind({ ...props.blob, ...metadata.value }),
);
const player = ref<HTMLMediaElement | null>(null);
onBeforeUnmount(() => {
  player.value?.pause();
  savePlayback();
  window.removeEventListener('pagehide', savePlayback);
});
const active = usePageActivity();
const visible = useDocumentVisible();
watch(active, (value) => {
  if (!value) player.value?.pause();
});
const source = ref(''),
  text = ref(''),
  error = ref('');
const loading = ref(false),
  pages = shallowRef<SourcePages>(),
  revision = ref(0);
let loadController: AbortController | undefined;
let checking = false;
function refresh() {
  if (loading.value) return;
  sourcePreview.value?.rememberScroll();
  savePlayback();
  focusReference.value = undefined;
  fileLocation.value = undefined;
  pendingTime = undefined;
  // Lock immediately, including repeated clicks before the watcher runs.
  loading.value = true;
  revision.value++;
}
defineExpose({
  refresh,
  loading,
  canCopy: computed(() => kind.value === 'text'),
  copy: async () => (await sourcePreview.value?.copyAll()) ?? false,
  canWrap: computed(() => kind.value === 'text' && !!sourcePreview.value?.showingSource),
  locate: (reference: import('../../core/replyReferences.ts').ReplyReference) => {
    focusReference.value = { ...reference };
  },
  locateFile: (location: BlobLocation, view?: 'image') => {
    if (view === 'image' && sourcePreviewKind(props.blob.name || props.name, props.blob.mime_type) === 'svg')
      sourceMode.value = 'preview';
    focusReference.value = undefined;
    fileLocation.value = { ...location };
    pendingTime = location.time;
    seekMention();
  },
});
watch(
  [() => props.session, () => props.blob.id, revision],
  async ([owner, id], previous, onCleanup) => {
    if (owner !== previous?.[0] || id !== previous?.[1]) sourceMode.value = undefined;
    const controller = new AbortController();
    loadController = controller;
    checking = false;
    metadata.value = undefined;
    onCleanup(() => controller.abort());
    source.value = '';
    text.value = '';
    error.value = '';
    pages.value = undefined;
    loading.value = true;
    try {
      const info = await blobMetadata(`${props.session}/${props.blob.id}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      metadata.value = info;
      emit('metadata', info);
      if (kind.value === 'text') {
        if (metadata.value.byte_count === 0) return;
        const url = blobUrl(`${props.session}/${props.blob.id}`);
        const document = new SourcePages(url, info.byte_count, info.version, controller.signal);
        if (
          info.byte_count > sourcePageBytes &&
          sourcePreviewKind(props.blob.name || props.name, info.mime_type) === 'html'
        ) {
          pages.value = document;
          return;
        }
        await document.next();
        if (controller.signal.aborted) return;
        if (info.byte_count <= sourcePageBytes && document.blocks.length <= 6) text.value = document.cache.get(0) ?? '';
        else pages.value = document;
      } else if (kind.value !== 'website' && kind.value !== 'file' && kind.value !== 'pdf') {
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
// Only the open, visible preview checks for changes. Unchanged files never
// download again; serialized probes and the load identity reject stale results.
watch(
  [() => props.session, () => props.blob.id, active, visible, () => props.blob.linked],
  ([owner, id, open, shown, linked], _, cleanup) => {
    if (!open || !shown || !linked) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    cleanup(() => {
      clearTimeout(timer);
      controller.abort();
    });
    async function check() {
      try {
        if (loading.value || checking) return;
        const load = loadController;
        const latest = await blobMetadata(`${owner}/${id}`, { signal: controller.signal });
        if (controller.signal.aborted || load !== loadController || loading.value) return;
        if (!metadata.value || latest.version !== metadata.value.version) refresh();
      } catch {
        // A temporary disconnect or a file being replaced must not remove the
        // preview the reader already has. The next probe can detect recovery.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(check, 5000);
      }
    }
    void check();
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
    // Recover immediately after a load error if the version changed; an
    // unchanged corrupt or unsupported file must not cause a retry loop.
    if (metadata.value?.version && latest.version !== metadata.value.version) {
      refresh();
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
  <div class="blob-preview" :class="`blob-preview-${kind}`" :aria-label="name" :aria-busy="loading">
    <LoadingState v-if="loading" :label="i18n.t('common.loading')" />
    <div v-else-if="error" class="library-state" role="alert">
      <p>{{ error }}</p>
      <button class="btn sm" @click="refresh">{{ i18n.t('common.retry') }}</button>
    </div>
    <template v-else>
      <WebsitePreview
        v-if="kind === 'website'"
        :key="revision"
        :session="session"
        :blob="blob.id"
        :name="name"
        :toolbar="toolbar"
      />
      <ImagePreview
        v-else-if="kind === 'image' && source"
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
        :reference="{ session, blob: blob.id }"
        :focus="focusReference"
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
      <SourcePreview
        v-else-if="kind === 'text'"
        ref="sourcePreview"
        v-model:mode="sourceMode"
        :text="text"
        :name="blob.name || name"
        :mime="metadata?.mime_type ?? blob.mime_type"
        :session="session"
        :blob="blob.id"
        :version="metadata?.version"
        :scroll="saved.scroll"
        :preview-scroll="saved.previewScroll"
        :pages="pages"
        @error="handleLoadFailure"
        :focus="focusReference"
        :toolbar="toolbar"
        @scroll="saved.scroll = $event"
        @preview-scroll="saved.previewScroll = $event"
      />
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
.blob-preview-website,
.blob-preview-text {
  overflow: hidden;
  padding: 0;
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
</style>
