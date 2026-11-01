<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { sessionBlobs, blobUrl, uploadSessionBlob } from '../../core/api/endpoints.ts';
import type { LibraryBlob } from '../../core/api/types.ts';
import type { EntryView } from '../../core/api/projections.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { downloadApiFile } from '../../ui/download.ts';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import Menu from '../../ui/components/Menu.vue';
import LibraryThumbnail from './LibraryThumbnail.vue';
import SelectField from '../../domain/providers/SelectField.vue';
import { platform } from '../../platform/index.ts';
import { cfg } from '../../core/config.ts';
import { toast } from '../../ui/toast.ts';
import Icon from '../../ui/components/Icon.vue';
import SessionBlobPreview from './SessionBlobPreview.vue';
import { attachmentNames, blobKind, blobIcon, blobName, type BlobKind } from './libraryFiles.ts';

const props = defineProps<{ session: string; mobile: boolean; entries: EntryView[]; libraryRevision: number }>();
const emit = defineEmits<{ close: []; mention: [blob: LibraryBlob, name: string] }>();
const items = ref<LibraryBlob[]>([]),
  selected = ref<LibraryBlob | null>(null);
const next = ref<number | null>(null),
  total = ref(0),
  loading = ref(false),
  error = ref('');
const filter = ref<BlobKind | 'all'>('all');
const active = usePageActivity();
const uploadedNames = ref(new Map<string, string>());
const names = computed(() => new Map([...attachmentNames(props.entries), ...uploadedNames.value]));
const uploading = ref(false);
let uploadController: AbortController | undefined;
onBeforeUnmount(() => uploadController?.abort());
async function upload() {
  if (uploading.value) return;
  const owner = props.session;
  const request = new AbortController();
  uploadController = request;
  uploading.value = true;
  try {
    const files = await platform('fs').pickFiles({ multiple: true });
    for (const file of files) {
      if (request.signal.aborted || props.session !== owner) return;
      if (file.size > cfg.composer.maxAttachmentBytes)
        throw new Error(i18n.t('library.tooLarge', { size: fmtBytes(cfg.composer.maxAttachmentBytes) }));
      const bytes = await file.read();
      if (request.signal.aborted || props.session !== owner) return;
      const blob = await uploadSessionBlob(owner, bytes, { signal: request.signal });
      if (request.signal.aborted || props.session !== owner) return;
      if (file.name) uploadedNames.value.set(blob.id, file.name);
    }
  } catch (cause) {
    if (!request.signal.aborted) toast(describeError(cause).message);
  } finally {
    if (!request.signal.aborted && owner === props.session) {
      uploading.value = false;
      // Replace an in-flight stale catalog response after the upload completes.
      controller?.abort();
      loading.value = false;
      await load();
    }
  }
}
const menuItems = computed(() => [{ key: 'mention', label: i18n.t('library.mention'), icon: 'at-sign' }]);
function mention(blob: LibraryBlob) {
  emit('mention', blob, filename(blob));
}
const filename = (blob: LibraryBlob) => blobName(blob, names.value);
const title = computed(() => (selected.value ? filename(selected.value) : i18n.t('library.title')));
const shown = computed(() => items.value.filter((blob) => filter.value === 'all' || blobKind(blob) === filter.value));
const filters = ['all', 'image', 'video', 'audio', 'pdf', 'text', 'file'] as const;
const filterOptions = computed(() =>
  filters.map((kind) => ({
    value: kind,
    label: kind === 'all' ? i18n.t('library.title') : i18n.t(`library.kind.${kind}`),
    icon: kind === 'all' ? 'library' : kind === 'pdf' ? 'file-pdf' : blobIcon(kind),
  })),
);
function selectFilter(value: string) {
  const kind = filters.find((kind) => kind === value);
  if (kind) filter.value = kind;
}
function back() {
  if (selected.value) selected.value = null;
  else emit('close');
}
useBackLayer(
  () => props.mobile,
  () => emit('close'),
  () => 45,
);
useBackLayer(
  () => props.mobile && !!selected.value,
  () => {
    selected.value = null;
  },
  () => 46,
);
watch(
  () => props.libraryRevision,
  () => {
    selected.value = null;
  },
);
let controller: AbortController | undefined;
async function load(more = false, quiet = false) {
  if (loading.value) return;
  const request = new AbortController();
  controller = request;
  const owner = props.session;
  loading.value = true;
  if (!quiet) error.value = '';
  try {
    const page = await sessionBlobs(owner, more ? (next.value ?? 0) : 0, { signal: request.signal });
    if (request.signal.aborted || owner !== props.session) return;
    const known = new Map((more ? items.value : []).map((blob) => [blob.id, blob]));
    for (const blob of page.items) known.set(blob.id, blob);
    items.value = [...known.values()];
    next.value = page.next;
    total.value = page.total;
    error.value = '';
  } catch (cause) {
    if (!request.signal.aborted && !quiet) error.value = describeError(cause).message;
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
watch(
  () => props.session,
  (_, __, onCleanup) => {
    controller?.abort();
    uploadController?.abort();
    uploading.value = false;
    uploadedNames.value.clear();
    loading.value = false;
    items.value = [];
    selected.value = null;
    next.value = null;
    total.value = 0;
    filter.value = 'all';
    void load();
    const timer = setInterval(() => {
      if (active.value && document.visibilityState !== 'hidden' && !selected.value && next.value === null)
        void load(false, true);
    }, 15000);
    onCleanup(() => {
      clearInterval(timer);
      controller?.abort();
    });
  },
  { immediate: true },
);
</script>

<template>
  <IslandSidebar :title="title" :overlay="mobile" @close="emit('close')" @back="back">
    <template #leading>
      <button v-if="selected" class="btn ghost icon-only" :aria-label="i18n.t('library.back')" @click="selected = null">
        <Icon name="arrow-left" />
      </button>
    </template>
    <template v-if="!selected" #title>
      <span class="library-title-controls">
        <SelectField
          :model-value="filter"
          :options="filterOptions"
          class="library-filter-select"
          :aria-label="i18n.t('library.filter')"
          @update:model-value="selectFilter"
        />
        <span class="library-count" :title="i18n.t('library.count', { count: total })">{{ total }}</span>
      </span>
    </template>
    <template #actions>
      <button
        v-if="!selected"
        class="btn ghost icon-only library-upload"
        :disabled="uploading"
        :aria-label="i18n.t('library.upload')"
        :title="i18n.t('library.upload')"
        @click="upload"
      >
        <Icon :name="uploading ? 'loader-circle' : 'upload'" :class="{ spin: uploading }" />
      </button>
      <a
        v-if="selected"
        class="btn ghost icon-only"
        :href="blobUrl(`${session}/${selected.id}`)"
        :download="filename(selected)"
        :aria-label="i18n.t('library.download')"
        @click="downloadApiFile($event, blobUrl(`${session}/${selected.id}`), filename(selected))"
        ><Icon name="download"
      /></a>
      <button
        v-else
        class="btn ghost icon-only"
        :disabled="loading"
        :aria-label="i18n.t('library.refresh')"
        @click="load()"
      >
        <Icon name="refresh-cw" :class="{ spin: loading }" />
      </button>
    </template>
    <template v-if="selected">
      <div class="library-file-meta">{{ selected.mime_type }} · {{ fmtBytes(selected.byte_count) }}</div>
      <SessionBlobPreview
        :key="`${session}/${selected.id}`"
        :session="session"
        :blob="selected"
        :name="filename(selected)"
      />
    </template>
    <template v-else>
      <div class="library-scroll">
        <div v-if="error" class="library-empty" role="alert">
          <p>{{ error }}</p>
          <button class="btn sm" @click="load()">{{ i18n.t('common.retry') }}</button>
        </div>
        <p v-else-if="loading && !items.length" class="library-empty" role="status">{{ i18n.t('common.loading') }}</p>
        <p v-else-if="!shown.length" class="library-empty">
          {{ i18n.t(items.length ? 'library.noMatches' : 'library.empty') }}
        </p>
        <div class="library-grid">
          <Menu v-for="blob in shown" :key="blob.id" context :items="menuItems" @select="mention(blob)">
            <div class="library-card">
              <button class="library-item" :data-blob-id="blob.id" @click="selected = blob">
                <LibraryThumbnail :session="session" :blob="blob" />
                <span class="library-filename" :title="filename(blob)">{{ filename(blob) }}</span>
                <span class="library-filesize">{{ fmtBytes(blob.byte_count) }}</span>
              </button>
              <Menu :items="menuItems" :label="i18n.t('library.fileActions')" @select="mention(blob)">
                <template #trigger>
                  <button class="library-item-menu btn ghost icon-only" :aria-label="i18n.t('library.fileActions')">
                    <Icon name="ellipsis-vertical" :size="16" />
                  </button>
                </template>
              </Menu>
            </div>
          </Menu>
        </div>
        <button v-if="next !== null" class="btn library-more" :disabled="loading" @click="load(true)">
          {{ i18n.t(loading ? 'common.loading' : 'library.more') }}
        </button>
      </div>
    </template>
  </IslandSidebar>
</template>

<style scoped>
.library-title-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.library-title-controls :deep(.library-filter-select) {
  width: auto;
  max-width: 100%;
  min-width: 0;
  padding: 4px 6px;
  min-height: 32px;
  gap: 8px;
  border: 0;
  background-color: transparent;
  font: inherit;
  color: var(--fg);
  cursor: pointer;
}
.library-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--fg-muted);
}
.library-card {
  width: 100%;
  max-width: 180px;
  position: relative;
  min-width: 0;
}
.library-item-menu {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 28px;
  height: 28px;
}
.library-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 14px 16px;
}
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 112px), 1fr));
  gap: 18px 12px;
}
.library-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  border-radius: 12px;
}
.library-filename {
  width: 100%;
  padding: 0 2px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library-filesize {
  padding: 0 2px;
  font-size: 11px;
  color: var(--fg-muted);
}
.library-item:hover :deep(.library-thumbnail) {
  border-color: var(--accent);
}
.library-empty {
  padding: 24px 8px;
  color: var(--fg-muted);
  text-align: center;
  font-size: 13px;
}
.library-more {
  display: flex;
  margin: 20px auto 0;
}
.library-file-meta {
  flex: none;
  padding: 0 18px 8px;
  font-size: 11px;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
</style>
