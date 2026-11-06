<script setup lang="ts">
import type { LibraryTarget } from './libraryTarget.ts';
import { tr } from '../../core/i18n/tr.ts';
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import { useVirtualGrid } from '../../ui/composables/useVirtualGrid.ts';
import { computed, nextTick, onBeforeUnmount, provide, ref, useId, watch } from 'vue';
import {
  sessionBlobs,
  blobUrl,
  uploadSessionBlob,
  linkSessionFile,
  blobMetadata,
  updateBlobLibrary,
  deleteBlob,
} from '../../core/api/endpoints.ts';
import type { LibraryBlob } from '../../core/api/types.ts';
import type { EntryView } from '../../core/api/projections.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { pageActivityKey, usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { downloadApiFile } from '../../ui/download.ts';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import Menu from '../../ui/components/Menu.vue';
import DirectoryPicker from '../../ui/components/DirectoryPicker.vue';
import Modal from '../../ui/components/Modal.vue';
import LibraryThumbnail from './LibraryThumbnail.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { platform } from '../../platform/index.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { cfg } from '../../core/config.ts';
import { toast } from '../../ui/toast.ts';
import Icon from '../../ui/components/Icon.vue';
import SessionBlobPreview from './SessionBlobPreview.vue';
import { attachmentNames, blobKind, blobIcon, blobName, type BlobKind } from './libraryFiles.ts';

const previewRef = ref<InstanceType<typeof SessionBlobPreview>>();
const mediaToolbar = ref<HTMLElement>();
let opening = 0;
async function openTarget(target: LibraryTarget['target']) {
  const owner = 'owner' in target ? target.owner : target.session;
  const id = 'owner' in target ? target.id : target.blob;
  if (!id || owner !== props.session) return;
  const request = ++opening;
  const blob = await blobMetadata(`${owner}/${id}`);
  if (request !== opening || owner !== props.session) return;
  const name = 'owner' in target ? target.name : (target.fileName ?? target.label);
  if (name) uploadedNames.value.set(blob.id, name);
  selectBlob({ ...blob, modified_at: 0 });
  await nextTick();
  if (request !== opening || owner !== props.session) return;
  if ('owner' in target) previewRef.value?.locateFile(target);
  else previewRef.value?.locate(target);
}

const linkFormId = useId();
const props = defineProps<{
  session: string;
  mobile: boolean;
  open: boolean;
  entries: EntryView[];
  libraryRevision: number;
  pendingTarget?: LibraryTarget;
}>();
const emit = defineEmits<{ close: []; targetHandled: [request: number]; mention: [blob: LibraryBlob, name: string] }>();
const items = ref<LibraryBlob[]>([]),
  selected = ref<LibraryBlob | null>(null);
const next = ref<number | null>(null),
  total = ref(0),
  loading = ref(false),
  error = ref('');
const saved = useWorkspaceState('library', () => props.session, {
  filter: 'all',
  selected: '',
  name: '',
  scroll: 0,
  loaded: 0,
});
const filter = ref<BlobKind | 'all'>('all');
const showAll = ref(false);
const updating = ref(new Set<string>());
function selectBlob(blob: LibraryBlob | null) {
  selected.value = blob;
  saved.value.selected = blob?.id ?? '';
  saved.value.name = blob ? filename(blob) : '';
}
const parentActive = usePageActivity();
const active = computed(() => parentActive.value && props.open);
provide(pageActivityKey, active);
watch(active, (visible) => {
  if (!visible) linkOpen.value = false;
});
const uploadedNames = ref(new Map<string, string>());
const names = computed(() => new Map([...attachmentNames(props.entries), ...uploadedNames.value]));
const uploading = ref(false);
const linkOpen = ref(false),
  localPath = ref(''),
  linking = ref(false),
  linkError = ref('');
async function addLink() {
  if (!localPath.value.trim() || linking.value) return;
  const owner = props.session;
  linking.value = true;
  linkError.value = '';
  try {
    await linkSessionFile(owner, localPath.value.trim());
    if (owner !== props.session) return;
    linkOpen.value = false;
    localPath.value = '';
    await reload();
  } catch (cause) {
    linkError.value = describeError(cause).message;
  } finally {
    linking.value = false;
  }
}

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
    const failures: string[] = [];
    for (const file of files) {
      try {
        if (request.signal.aborted || props.session !== owner) return;
        const limit = file.mime.startsWith('image/') ? cfg.composer.maxImageBytes : cfg.composer.maxAttachmentBytes;
        if (file.size > limit) throw new Error(i18n.t('library.tooLarge', { size: fmtBytes(limit) }));
        const bytes = file.body ?? (await file.read());
        if (request.signal.aborted || props.session !== owner) return;
        const blob = await uploadSessionBlob(owner, bytes, { signal: request.signal, query: { name: file.name } });
        if (request.signal.aborted || props.session !== owner) return;
        if (file.name) uploadedNames.value.set(blob.id, file.name);
      } catch (cause) {
        if (request.signal.aborted || props.session !== owner) return;
        failures.push(`${file.name}: ${describeError(cause).message}`);
      }
    }
    if (failures.length) toast(failures.join('\n'));
  } catch (cause) {
    if (!request.signal.aborted) toast(describeError(cause).message);
  } finally {
    if (uploadController === request) {
      uploadController = undefined;
      uploading.value = false;
    }
    if (!request.signal.aborted && owner === props.session) {
      // Replace an in-flight stale catalog response after the upload completes.
      await reload();
    }
  }
}
const menuItems = (blob: LibraryBlob) => [
  { key: 'mention', label: i18n.t('library.mention'), icon: 'at-sign' },
  {
    key: 'visible',
    label: blob.visible === false ? tr('加入展示库', 'Show in Library') : tr('从库中隐藏', 'Hide from Library'),
    icon: blob.visible === false ? 'eye' : 'eye-off',
  },
  {
    key: 'pin',
    label: blob.pinned ? tr('取消置顶', 'Unpin') : tr('置顶', 'Pin to top'),
    icon: 'pin',
    checked: !!blob.pinned,
  },
  { key: 'delete', label: tr('删除文件', 'Delete file'), icon: 'trash-2', danger: true, separator: true },
];
async function act(key: string, blob: LibraryBlob) {
  if (key === 'mention') return mention(blob);
  if (updating.value.has(blob.id)) return;
  const owner = props.session;
  updating.value.add(blob.id);
  try {
    if (key === 'delete') {
      await deleteBlob(`${owner}/${blob.id}`);
      if (owner !== props.session) return;
      if (selected.value?.id === blob.id) selectBlob(null);
    } else {
      const state = await updateBlobLibrary(
        `${owner}/${blob.id}`,
        key === 'pin' ? { pinned: !blob.pinned } : { visible: blob.visible === false },
      );
      if (owner !== props.session) return;
      if (selected.value?.id === blob.id) selected.value = { ...selected.value, ...state };
    }
    await reload(true);
  } catch (cause) {
    toast(describeError(cause).message);
  } finally {
    updating.value.delete(blob.id);
  }
}
function mention(blob: LibraryBlob) {
  emit('mention', blob, filename(blob));
}
const filename = (blob: LibraryBlob) => blobName(blob, names.value);
const title = computed(() => (selected.value ? filename(selected.value) : i18n.t('library.title')));
const shown = computed(() => items.value.filter((blob) => filter.value === 'all' || blobKind(blob) === filter.value));
const gridViewport = ref<HTMLElement>();
const grid = useVirtualGrid(
  gridViewport,
  computed(() => shown.value.length),
);
const visibleItems = computed(() => shown.value.slice(grid.start.value, grid.end.value));
watch(filter, (value) => {
  grid.reset();
  saved.value.filter = value;
  saved.value.scroll = 0;
});
watch(() => props.session, grid.reset);
watch(showAll, () => {
  controller?.abort();
  loading.value = false;
  items.value = [];
  next.value = null;
  total.value = 0;
  grid.reset();
  saved.value.scroll = 0;
  void load();
});
function rememberGrid() {
  if (gridViewport.value?.clientHeight && active.value) saved.value.scroll = gridViewport.value.scrollTop;
}
function restoreGrid() {
  if (gridViewport.value) {
    gridViewport.value.scrollTop = Math.max(0, saved.value.scroll);
    gridViewport.value.dispatchEvent(new Event('scroll'));
  }
}
watch(gridViewport, restoreGrid, { flush: 'post' });
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
  if (selected.value) selectBlob(null);
  else emit('close');
}
useBackLayer(
  () => props.open && props.mobile,
  () => emit('close'),
  () => 45,
);
useBackLayer(
  () => props.open && props.mobile && !!selected.value,
  () => {
    selectBlob(null);
  },
  () => 46,
);
watch(
  () => props.libraryRevision,
  () => {
    selectBlob(null);
  },
);
let controller: AbortController | undefined;
function reload(quiet = false) {
  controller?.abort();
  loading.value = false;
  return load(false, quiet);
}
async function load(more = false, quiet = false) {
  if (loading.value) return;
  const request = new AbortController();
  controller = request;
  const owner = props.session;
  loading.value = true;
  if (!quiet) error.value = '';
  try {
    const page = await sessionBlobs(owner, more ? (next.value ?? 0) : 0, {
      signal: request.signal,
      query: { include_hidden: showAll.value },
    });
    if (request.signal.aborted || owner !== props.session) return;
    const known = new Map((more ? items.value : []).map((blob) => [blob.id, blob]));
    for (const blob of page.items) known.set(blob.id, blob);
    items.value = [...known.values()];
    next.value = page.next;
    total.value = page.total;
    saved.value.loaded = items.value.length;
    error.value = '';
  } catch (cause) {
    if (!request.signal.aborted && !quiet) error.value = describeError(cause).message;
  } finally {
    if (controller === request) {
      controller = undefined;
      loading.value = false;
    }
  }
}
watch(
  () => props.session,
  (_, __, onCleanup) => {
    const owner = props.session;
    let disposed = false;
    controller?.abort();
    uploadController?.abort();
    uploading.value = false;
    uploadedNames.value.clear();
    loading.value = false;
    items.value = [];
    selected.value = null;
    next.value = null;
    total.value = 0;
    const restored = { ...saved.value };
    filter.value = filters.includes(restored.filter as (typeof filters)[number])
      ? (restored.filter as (typeof filters)[number])
      : 'all';
    void (async () => {
      await load();
      if (disposed) return;
      while (
        !disposed &&
        props.session === owner &&
        next.value !== null &&
        items.value.length < Math.min(restored.loaded, 2000)
      ) {
        const before = items.value.length;
        await load(true);
        if (items.value.length === before) break;
      }
      if (disposed || props.session !== owner) return;
      saved.value.scroll = restored.scroll;
      if (restored.selected) {
        try {
          const blob = items.value.find((item) => item.id === restored.selected) ?? {
            ...(await blobMetadata(`${owner}/${restored.selected}`)),
            modified_at: 0,
            name: restored.name,
          };
          if (!disposed && props.session === owner && saved.value.selected === restored.selected) selected.value = blob;
        } catch {
          if (!disposed && props.session === owner && saved.value.selected === restored.selected) {
            saved.value.selected = '';
          }
        }
      }
      await nextTick();
      restoreGrid();
    })();
    const timer = setInterval(() => {
      if (active.value && document.visibilityState !== 'hidden' && !selected.value && next.value === null)
        void load(false, true);
    }, 15000);
    onCleanup(() => {
      disposed = true;
      clearInterval(timer);
      controller?.abort();
    });
  },
  { immediate: true },
);
watch(
  [() => props.pendingTarget, () => props.open],
  async ([pending, open], _, cleanup) => {
    if (!pending || !open) return;
    let current = true;
    cleanup(() => {
      current = false;
      opening++;
    });
    try {
      await openTarget(pending.target);
    } catch (cause) {
      if (current) toast(describeError(cause).message);
    } finally {
      if (current) emit('targetHandled', pending.request);
    }
  },
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <IslandSidebar
    :width="prefs.rightSidebarWidth.value"
    @update:width="prefs.setRightSidebarWidth"
    :open="open"
    :title="title"
    :overlay="mobile"
    @close="emit('close')"
    @back="back"
  >
    <template #leading>
      <button
        v-if="selected || mobile"
        class="btn ghost icon-only"
        :aria-label="selected ? i18n.t('library.back') : tr('关闭侧栏', 'Close sidebar')"
        @click="back"
      >
        <Icon :name="selected ? 'arrow-left' : 'chevron-right'" />
      </button>
    </template>
    <template #title>
      <span v-if="!selected" class="library-title-controls">
        <SelectField
          :model-value="filter"
          :options="filterOptions"
          class="library-filter-select"
          :aria-label="i18n.t('library.filter')"
          @update:model-value="selectFilter"
        />
        <span class="library-count" :title="i18n.t('library.count', { count: total })">{{ total }}</span>
      </span>
      <span
        v-else
        class="library-file-title"
        :title="`${filename(selected)} · ${selected.mime_type} · ${fmtBytes(selected.byte_count)}`"
      >
        <span>{{ filename(selected) }}</span>
        <small v-if="selected.mime_type !== 'application/pdf'"
          >{{ selected.mime_type }} · {{ fmtBytes(selected.byte_count) }}</small
        >
      </span>
    </template>
    <template v-if="selected" #toolbar><div ref="mediaToolbar" class="library-media-toolbar" /></template>
    <template #actions>
      <button
        v-if="!selected"
        class="btn ghost icon-only library-all"
        :class="{ active: showAll }"
        :aria-pressed="showAll"
        :aria-label="showAll ? tr('返回展示库', 'Return to Library') : tr('查看全部文件', 'Show all files')"
        :title="showAll ? tr('返回展示库', 'Return to Library') : tr('查看全部文件', 'Show all files')"
        @click="showAll = !showAll"
      >
        <Icon name="eye" />
      </button>
      <button
        v-if="!selected"
        class="btn ghost icon-only library-link"
        :aria-label="i18n.t('library.linkFile')"
        @click="
          linkError = '';
          linkOpen = true;
        "
      >
        <Icon name="link" />
      </button>
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
      <SessionBlobPreview
        ref="previewRef"
        :key="`${session}/${selected.id}`"
        :session="session"
        :blob="selected"
        :name="filename(selected)"
        :toolbar="mediaToolbar"
        @metadata="
          (metadata) => {
            if (selected?.id === metadata.id) selected = { ...selected, ...metadata };
          }
        "
      />
    </template>
    <template v-else>
      <div ref="gridViewport" class="library-scroll" @scroll.passive="rememberGrid">
        <p v-if="showAll" class="library-all-hint">
          {{ tr('全部文件 · 可将需要的文件加入展示库', 'All files · Add files you need to your Library') }}
        </p>
        <div v-if="error" class="library-empty" role="alert">
          <p>{{ error }}</p>
          <button class="btn sm" @click="load()">{{ i18n.t('common.retry') }}</button>
        </div>
        <p v-else-if="loading && !items.length" class="library-empty" role="status">{{ i18n.t('common.loading') }}</p>
        <p v-else-if="!shown.length" class="library-empty">
          {{ i18n.t(items.length ? 'library.noMatches' : 'library.empty') }}
        </p>
        <div class="library-grid" :style="grid.style.value">
          <Menu
            v-for="blob in visibleItems"
            :key="blob.id"
            context
            :items="menuItems(blob)"
            :disabled="updating.has(blob.id)"
            @select="act($event, blob)"
          >
            <div class="library-card" :class="{ 'library-hidden': blob.visible === false }">
              <div v-if="blob.pinned || blob.visible === false" class="library-badges">
                <span v-if="blob.pinned" :title="tr('已置顶', 'Pinned')"><Icon name="pin" :size="13" /></span>
                <span v-if="blob.visible === false" :title="tr('未在库中展示', 'Hidden from Library')"
                  ><Icon name="eye-off" :size="13"
                /></span>
              </div>
              <button
                class="library-item"
                :data-blob-id="blob.id"
                :title="blob.local_path || undefined"
                @click="selectBlob(blob)"
              >
                <LibraryThumbnail :session="session" :blob="blob" />
                <span class="library-filename" :title="filename(blob)">{{ filename(blob) }}</span>
                <span class="library-filesize"
                  ><Icon v-if="blob.linked" name="link" :size="12" />{{
                    blob.available === false ? i18n.t('library.unavailable') : fmtBytes(blob.byte_count)
                  }}</span
                >
              </button>
              <Menu
                :items="menuItems(blob)"
                :disabled="updating.has(blob.id)"
                :label="i18n.t('library.fileActions')"
                @select="act($event, blob)"
              >
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
  <Modal compact :open="linkOpen" :dismissable="!linking" :title="i18n.t('library.linkFile')" @close="linkOpen = false">
    <form :id="linkFormId" class="library-link-form" @submit.prevent="addLink">
      <p>{{ i18n.t('library.linkHint') }}</p>
      <div class="library-path-picker">
        <input
          v-model="localPath"
          class="input"
          data-initial-focus
          :aria-label="i18n.t('library.localPath')"
          :placeholder="i18n.t('library.localPath')"
          :disabled="linking"
        />
        <DirectoryPicker v-model="localPath" mode="file" side="bottom" :disabled="linking">
          <template #trigger
            ><button
              type="button"
              class="btn ghost icon-only"
              :disabled="linking"
              :aria-label="i18n.t('library.browseFiles')"
              :title="i18n.t('library.browseFiles')"
            >
              <Icon name="folder" /></button
          ></template>
        </DirectoryPicker>
      </div>
      <p v-if="linkError" role="alert">{{ linkError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn ghost" :disabled="linking" @click="linkOpen = false">
        {{ tr('取消', 'Cancel') }}
      </button>
      <button :form="linkFormId" type="submit" class="btn primary" :disabled="linking || !localPath.trim()">
        {{ linking ? i18n.t('common.loading') : i18n.t('library.linkFile') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.library-path-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}
.library-path-picker .input {
  flex: 1;
  min-width: 0;
}
.library-path-picker .btn {
  flex: none;
}
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
.library-all.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.library-all-hint {
  color: var(--fg-muted);
  font-size: 11px;
  padding: 0 2px 12px;
}
.library-badges {
  position: absolute;
  inset: 6px auto auto 6px;
  display: flex;
  gap: 4px;
  z-index: 1;
  pointer-events: none;
}
.library-badges span {
  display: flex;
  padding: 4px;
  border-radius: 5px;
  background: var(--bg-raised);
  color: var(--fg-muted);
}
.library-hidden :deep(.library-thumbnail) {
  opacity: 0.65;
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
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library-link-form {
  display: grid;
  gap: 12px;
}
.library-link-form p {
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  color: var(--fg-muted);
}
.library-filesize {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
  font-size: 11px;
  line-height: 16px;
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
.library-media-toolbar {
  flex: none;
  display: flex;
  align-items: center;
}
.library-file-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.library-file-title > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.library-file-title small {
  flex: none;
  font-size: 11px;
  font-weight: 400;
  color: var(--fg-muted);
}
@container (max-width: 600px) {
  .library-file-title small {
    display: none;
  }
}
</style>
