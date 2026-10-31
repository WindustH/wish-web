<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { sessionBlobs, blobUrl } from '../../core/api/endpoints.ts';
import type { LibraryBlob } from '../../core/api/types.ts';
import type { EntryView } from '../../core/api/projections.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { downloadApiFile } from '../../ui/download.ts';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import ApiImage from '../../ui/components/ApiImage.vue';
import Icon from '../../ui/components/Icon.vue';
import SessionBlobPreview from './SessionBlobPreview.vue';
import { attachmentNames, blobIcon, blobKind, blobName, type BlobKind } from './libraryFiles.ts';

const props = defineProps<{ session: string; mobile: boolean; entries: EntryView[]; libraryRevision: number }>();
const emit = defineEmits<{ close: [] }>();
const items = ref<LibraryBlob[]>([]),
  selected = ref<LibraryBlob | null>(null);
const next = ref<number | null>(null),
  total = ref(0),
  loading = ref(false),
  error = ref('');
const filter = ref<BlobKind | 'all'>('all');
const active = usePageActivity();
const names = computed(() => attachmentNames(props.entries));
const filename = (blob: LibraryBlob) => blobName(blob, names.value);
const title = computed(() => (selected.value ? filename(selected.value) : i18n.t('library.title')));
const shown = computed(() => items.value.filter((blob) => filter.value === 'all' || blobKind(blob) === filter.value));
const filters = ['all', 'image', 'video', 'audio', 'pdf', 'text', 'file'] as const;
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
      <Icon v-else name="library" class="library-heading-icon" />
    </template>
    <template #actions>
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
      <div class="library-overview">
        <span>{{ i18n.t('library.sessionFiles') }}</span
        ><span>{{ i18n.t('library.count', { count: total }) }}</span>
      </div>
      <div class="library-filters" :aria-label="i18n.t('library.filter')">
        <button
          v-for="kind in filters"
          :key="kind"
          class="library-filter"
          :aria-pressed="filter === kind"
          @click="filter = kind"
        >
          {{ i18n.t(`library.kind.${kind}`) }}
        </button>
      </div>
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
          <button
            v-for="blob in shown"
            :key="blob.id"
            class="library-item"
            :data-blob-id="blob.id"
            @click="selected = blob"
          >
            <span class="library-thumbnail" :class="blobKind(blob)">
              <ApiImage
                v-if="blobKind(blob) === 'image'"
                :src="blobUrl(`${session}/${blob.id}`)"
                :zoom="false"
                alt=""
                loading="lazy"
              />
              <Icon v-else :name="blobIcon(blobKind(blob))" :size="32" />
              <span class="library-file-kind">{{ i18n.t(`library.kind.${blobKind(blob)}`) }}</span>
            </span>
            <span class="library-filename" :title="filename(blob)">{{ filename(blob) }}</span>
            <span class="library-filesize">{{ fmtBytes(blob.byte_count) }}</span>
          </button>
        </div>
        <button v-if="next !== null" class="btn library-more" :disabled="loading" @click="load(true)">
          {{ i18n.t(loading ? 'common.loading' : 'library.more') }}
        </button>
      </div>
    </template>
  </IslandSidebar>
</template>

<style scoped>
.library-heading-icon {
  color: var(--accent);
  margin-right: 4px;
}
.library-overview {
  display: flex;
  justify-content: space-between;
  padding: 0 18px 14px;
  gap: 12px;
  color: var(--fg-muted);
  font-size: 12px;
}
.library-filters {
  display: flex;
  flex: none;
  gap: 4px;
  padding: 0 12px 12px;
  flex-wrap: wrap;
}
.library-filter {
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
  color: var(--fg-subtle);
}
.library-filter[aria-pressed='true'] {
  background: var(--accent-soft);
  border-color: var(--line);
  color: var(--accent);
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 12px;
}
.library-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  border-radius: 12px;
}
.library-thumbnail {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-sunken);
  color: var(--fg-subtle);
  overflow: hidden;
}
.library-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.library-thumbnail.pdf {
  color: var(--accent);
}
.library-file-kind {
  position: absolute;
  bottom: 6px;
  right: 6px;
  font-size: 10px;
  background: var(--bg-raised);
  border-radius: 5px;
  padding: 2px 5px;
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
.library-item:hover .library-thumbnail {
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
