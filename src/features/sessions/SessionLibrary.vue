<script setup lang="ts">
import SessionSidebarTitle from './SessionSidebarTitle.vue';
import { bus } from '../../core/bus.ts';
import type { LibraryTarget } from './libraryTarget.ts';
import { tr } from '../../core/i18n/tr.ts';
import { useWorkspaceState } from '../../ui/composables/useWorkspaceState.ts';
import { useVirtualGrid } from '../../ui/composables/useVirtualGrid.ts';
import { computed, nextTick, onBeforeUnmount, provide, ref, useId, watch } from 'vue';
import {
  directoriesList,
  linkSessionFile,
  sessionBlobs,
  openLinkedFolderFile,
  renameLinkedFolderChild,
  blobUrl,
  uploadSessionBlob,
  linkLibraryPath,
  blobMetadata,
  updateBlobLibrary,
  deleteBlob,
  moveLibraryItems,
} from '../../core/api/endpoints.ts';
import type {
  DirectoryListing,
  LibraryBlob,
  LibraryBookmark,
  LibraryFolder,
  LinkedFolderChild,
} from '../../core/api/types.ts';
import type { StoredAttachmentReference } from '../../core/attachments.ts';
import type { EntryView } from '../../core/api/projections.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { ApiError } from '../../core/api/client.ts';
import { fmtBytes, fmtDateTime } from '../../core/util/fmt.ts';
import { useBackLayer } from '../../ui/composables/useBackLayer.ts';
import { pageActivityKey, usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { saveApiFile } from '../../ui/download.ts';
import IslandSidebar from '../../ui/components/IslandSidebar.vue';
import Menu from '../../ui/components/Menu.vue';
import type { MenuItem } from '../../ui/components/menuTypes.ts';
import DirectoryPicker from '../../ui/components/DirectoryPicker.vue';
import Modal from '../../ui/components/Modal.vue';
import LibraryThumbnail from './LibraryThumbnail.vue';
import LibraryDocumentThumbnail from './LibraryDocumentThumbnail.vue';
import LibraryFolderThumbnail from './LibraryFolderThumbnail.vue';
import { platform } from '../../platform/index.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import { cfg } from '../../core/config.ts';
import { toast } from '../../ui/toast.ts';
import Icon from '../../ui/components/Icon.vue';
import SessionBlobPreview from './SessionBlobPreview.vue';
import { attachmentNames, blobKind, blobIcon, blobName, type BlobKind } from './libraryFiles.ts';
import LibraryRenameDialog from './LibraryRenameDialog.vue';
import LibraryLinkedFolder from './LibraryLinkedFolder.vue';
import { useLibraryBookmarks } from './useLibraryBookmarks.ts';
import LibraryFolderDialog from './LibraryFolderDialog.vue';
import LibraryCleanupDialog from './LibraryCleanupDialog.vue';
import { folderTrail, type LibraryFolderAction } from './libraryFolders.ts';
import { useListDrag } from './useListDrag.ts';
import { useTouchRangeSelection } from './useTouchRangeSelection.ts';

const previewRef = ref<InstanceType<typeof SessionBlobPreview>>();
const mediaToolbar = ref<HTMLElement>();
const localTrail = ref<DirectoryListing[]>([]);
const localDirectory = computed(() => localTrail.value.at(-1));
let opening = 0;
async function openLocalChild(name: string, directory: boolean) {
  const parent = localDirectory.value;
  if (!parent) return;
  const separator = parent.path.startsWith('/') ? '/' : '\\';
  const path = parent.path.endsWith(separator) ? parent.path + name : parent.path + separator + name;
  const request = ++opening;
  try {
    if (directory) {
      const listing = await directoriesList(path, true);
      if (opening === request && active.value && localDirectory.value === parent) localTrail.value.push(listing);
    } else {
      const owner = props.session;
      const blob = await linkSessionFile(owner, path, true);
      if (opening === request && active.value && localDirectory.value === parent && props.session === owner)
        await openTarget({ owner, id: blob.id, name }, request);
    }
  } catch (cause) {
    if (opening === request && active.value) toast(describeError(cause).message);
  }
}
async function openTarget(target: LibraryTarget['target'], childRequest?: number) {
  const owner = 'owner' in target ? target.owner : target.session;
  if ('directory' in target) {
    if (owner !== props.session) return;
    opening++;
    stopSelecting();
    selectBlob(null);
    localTrail.value = [target.directory];
    return;
  }
  const id = 'owner' in target ? target.id : target.blob;
  if (!id || owner !== props.session) return;
  const request = childRequest ?? ++opening;
  const blob = await blobMetadata(`${owner}/${id}`);
  if (request !== opening || owner !== props.session) return;
  const name = 'owner' in target ? target.name : (target.fileName ?? target.label);
  if (childRequest === undefined) localTrail.value = [];
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
const emit = defineEmits<{
  close: [];
  navigate: [view: 'info' | 'library' | 'tasks'];
  targetHandled: [request: number];
  mention: [files: StoredAttachmentReference[]];
}>();
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
  folder: '',
});
const folder = computed(() => saved.value.folder || null);
const folders = ref<LibraryFolder[]>([]);
const supportsFolders = ref<boolean>();
const folderAction = ref<LibraryFolderAction>();
const linkedFolder = computed(() => folders.value.find((item) => item.id === folder.value && item.linked_path));
const linkedBrowser = ref<InstanceType<typeof LibraryLinkedFolder>>();
const linkedRevision = ref(0);
const renameTarget = ref<LibraryBlob>();
const linkedSelection = ref<{ folder: string; path: string }>();
let linkedOpenController: AbortController | undefined;
async function renameFile(name: string, signal: AbortSignal) {
  const blob = renameTarget.value;
  if (!blob) return;
  const owner = props.session;
  const child = selected.value?.id === blob.id ? linkedSelection.value : undefined;
  if (child) {
    await renameLinkedFolderChild(owner, child.folder, child.path, name, { signal });
    linkedRevision.value++;
  }
  const state = await updateBlobLibrary(`${owner}/${blob.id}`, { display_name: name }, { signal });
  if (signal.aborted || owner !== props.session) return;
  if (selected.value?.id === blob.id) selected.value = { ...selected.value, ...state };
  items.value = items.value.map((item) => (item.id === blob.id ? { ...item, ...state } : item));
}
async function openLinkedChild(child: LinkedFolderChild) {
  const folderId = linkedFolder.value?.id;
  if (!folderId) return;
  const request = ++opening,
    owner = props.session;
  linkedOpenController?.abort();
  const controller = new AbortController();
  linkedOpenController = controller;
  try {
    const opts = { signal: controller.signal };
    const blob = await openLinkedFolderFile(owner, folderId, child.path, opts);
    const metadata = await blobMetadata(`${owner}/${blob.id}`, opts);
    if (
      controller.signal.aborted ||
      request !== opening ||
      props.session !== owner ||
      folder.value !== folderId ||
      !active.value
    )
      return;
    selectBlob({ ...metadata, linked: true, local_path: blob.path, modified_at: 0 });
    linkedSelection.value = { folder: folderId, path: child.path };
  } catch (cause) {
    if (!controller.signal.aborted && request === opening && props.session === owner)
      toast(describeError(cause).message);
  } finally {
    if (linkedOpenController === controller) linkedOpenController = undefined;
  }
}
const cleanupOpen = ref(false);
const trail = computed(() => folderTrail(folders.value, folder.value));
const childFolders = computed(() =>
  folders.value.filter((item) => item.parent === folder.value).sort((a, b) => a.name.localeCompare(b.name)),
);
const viewState = useWorkspaceState('library-view', () => 'all', { mode: 'icons' });
const view = computed(() => (['compact', 'details'].includes(viewState.value.mode) ? viewState.value.mode : 'icons'));
function openFolder(id: string | null) {
  saved.value = { ...saved.value, folder: id ?? '', selected: '', name: '', scroll: 0, loaded: 0 };
}
let moveController: AbortController | undefined;
async function moveFiles(ids: string[], into: string | null) {
  if (!supportsFolders.value || batchBusy.value || folders.value.some((item) => item.id === into && item.linked_path))
    return;
  const owner = props.session;
  const origin = folder.value;
  const request = new AbortController();
  moveController = request;
  batchBusy.value = true;
  try {
    await moveLibraryItems(owner, ids, into, { signal: request.signal });
    if (!request.signal.aborted && props.session === owner && folder.value === origin) {
      stopSelecting();
      await reload();
    }
  } catch (cause) {
    if (!request.signal.aborted) toast(describeError(cause).message);
  } finally {
    if (moveController === request) {
      moveController = undefined;
      batchBusy.value = false;
    }
  }
}
const drag = useListDrag(
  (ids, into) => void moveFiles(ids, into),
  openFolder,
  (into) => !folders.value.some((item) => item.id === into && item.linked_path),
);
function dragIds(blob: LibraryBlob) {
  return chosen.value.has(blob.id) ? [...chosen.value] : [blob.id];
}
function dragFile(blob: LibraryBlob, event: DragEvent) {
  if (!supportsFolders.value || batchBusy.value) {
    event.preventDefault();
    return;
  }
  drag.start(event, dragIds(blob), folder.value);
}
function pressFile(blob: LibraryBlob, event: TouchEvent) {
  if (!selecting.value && supportsFolders.value && !batchBusy.value)
    drag.press(event, [blob.id], folder.value, filename(blob));
}
function folderMenu(item?: LibraryFolder) {
  return [
    { key: 'rename', label: tr('重命名', 'Rename'), icon: 'pencil' },
    { key: 'move', label: tr('移动到…', 'Move to…'), icon: 'folder' },
    {
      key: 'delete',
      label: item?.linked_path ? tr('移除链接', 'Remove link') : tr('删除文件夹', 'Delete folder'),
      icon: 'trash-2',
      danger: true,
      separator: true,
    },
  ];
}
function actFolder(key: string, item: LibraryFolder) {
  if (key === 'move') folderAction.value = { kind: 'move', ids: [item.id], from: item.parent };
  else if (key === 'rename' || key === 'delete') folderAction.value = { kind: key, folder: item };
}
function folderChanged() {
  stopSelecting();
  void reload();
}
onBeforeUnmount(() => moveController?.abort());
const filter = ref<BlobKind | 'all' | 'bookmarks'>('all');
const showAll = ref(false);
const updating = ref(new Set<string>());
const selecting = ref(false);
const chosen = ref(new Set<string>());
let selectionAnchor: string | undefined;
const batchBusy = ref(false);
const batchProgress = ref('');
const deleteTargets = ref<LibraryBlob[]>([]);
let batchController: AbortController | undefined;
onBeforeUnmount(() => batchController?.abort());
function stopSelecting() {
  selecting.value = false;
  chosen.value = new Set();
  selectionAnchor = undefined;
}
function selectBlob(blob: LibraryBlob | null) {
  linkedSelection.value = undefined;
  if (blob) stopSelecting();
  selected.value = blob;
  saved.value.selected = blob?.id ?? '';
  saved.value.name = blob ? filename(blob) : '';
}
const parentActive = usePageActivity();
const active = computed(() => parentActive.value && props.open);
provide(pageActivityKey, active);
const bookmarks = useLibraryBookmarks(
  computed(() => props.session),
  computed(() => active.value && !folder.value),
);
watch(active, (visible) => {
  if (!visible) {
    cancelOperations();
    drag.cancel();
    folderAction.value = undefined;
    cleanupOpen.value = false;
    renameTarget.value = undefined;
    linkOpen.value = false;
    deleteTargets.value = [];
    stopSelecting();
  }
});
const uploadedNames = ref(new Map<string, string>());
const names = computed(() => new Map([...attachmentNames(props.entries), ...uploadedNames.value]));
const uploading = ref(false);
const linkOpen = ref(false),
  localPath = ref(''),
  linking = ref(false),
  linkError = ref('');
const linkPaths = computed(() => [
  ...new Set(
    localPath.value
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean),
  ),
]);
function chooseLinks(paths: string[]) {
  localPath.value = paths.join('\n');
}
let linkController: AbortController | undefined;
onBeforeUnmount(() => linkController?.abort());
async function addLink() {
  const paths = linkPaths.value;
  if (!paths.length || linking.value) return;
  if (paths.length > 100) {
    linkError.value = tr('一次最多链接 100 项', 'Link up to 100 items at a time');
    return;
  }
  const owner = props.session;
  const destination = folder.value;
  const request = new AbortController();
  linkController = request;
  linking.value = true;
  linkError.value = '';
  const failures: { path: string; error: string }[] = [];
  try {
    for (const path of paths) {
      if (request.signal.aborted || owner !== props.session) return;
      try {
        await linkLibraryPath(owner, path, destination, { signal: request.signal });
      } catch (cause) {
        if (request.signal.aborted || owner !== props.session) return;
        failures.push({ path, error: describeError(cause).message });
      }
    }
    if (request.signal.aborted || owner !== props.session) return;
    localPath.value = failures.map((item) => item.path).join('\n');
    linkError.value = failures.map((item) => `${item.path}: ${item.error}`).join('\n');
    if (!failures.length) linkOpen.value = false;
    await reload();
  } finally {
    if (linkController === request) {
      linkController = undefined;
      linking.value = false;
    }
  }
}

let uploadController: AbortController | undefined;
onBeforeUnmount(() => uploadController?.abort());
function cancelOperations() {
  linkedOpenController?.abort();
  linkedOpenController = undefined;
  for (const request of [moveController, batchController, linkController, uploadController]) request?.abort();
  moveController = batchController = linkController = uploadController = undefined;
  batchBusy.value = linking.value = uploading.value = false;
  batchProgress.value = '';
}
async function upload() {
  if (uploading.value) return;
  const owner = props.session;
  const destination = folder.value;
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
        if (destination) await moveLibraryItems(owner, [blob.id], destination, { signal: request.signal });
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
const filterMenu = computed<MenuItem>(() => ({
  key: 'filter',
  label: tr('筛选', 'Filter'),
  icon: 'filter',
  children: filterOptions.value.map((item) => ({
    key: `filter:${item.value}`,
    label: item.label,
    icon: item.icon,
    checked: filter.value === item.value,
  })),
}));
const libraryActions = computed<MenuItem[]>(() =>
  linkedFolder.value && filter.value !== 'bookmarks'
    ? [
        filterMenu.value,
        { key: 'refresh', label: i18n.t('library.refresh'), icon: 'refresh-cw' },
        ...folderMenu(linkedFolder.value),
      ]
    : [
        filterMenu.value,
        {
          key: 'select',
          label: selecting.value ? tr('退出多选', 'Stop selecting') : tr('多选文件', 'Select files'),
          icon: 'check-square',
          checked: selecting.value,
        },
        ...(selecting.value
          ? []
          : [
              {
                key: 'all',
                label: showAll.value ? tr('返回展示库', 'Return to Library') : tr('查看全部文件', 'Show all files'),
                icon: 'eye',
                checked: showAll.value,
              },
              { key: 'link', label: i18n.t('library.linkFile'), icon: 'link', disabled: linking.value },
              { key: 'upload', label: i18n.t('library.upload'), icon: 'upload', disabled: uploading.value },
              ...(supportsFolders.value
                ? [{ key: 'new-folder', label: tr('新建文件夹', 'New folder'), icon: 'folder-plus' }]
                : []),
              {
                key: 'refresh',
                label: i18n.t('library.refresh'),
                icon: 'refresh-cw',
                disabled: loading.value,
                separator: true,
              },
              {
                key: 'cleanup',
                label: tr('清理文件库…', 'Clean up Library…'),
                icon: 'eraser',
                disabled: uploading.value || linking.value,
              },
            ]),
        {
          key: 'view',
          label: tr('视图', 'View'),
          icon: 'grid',
          separator: true,
          children: [
            { key: 'icons', label: tr('图标视图', 'Icons'), icon: 'grid', checked: view.value === 'icons' },
            { key: 'compact', label: tr('紧凑列表', 'Compact list'), icon: 'list', checked: view.value === 'compact' },
            {
              key: 'details',
              label: tr('详细列表', 'Details'),
              icon: 'list-details',
              checked: view.value === 'details',
            },
          ],
        },
      ],
);
function libraryAction(key: string) {
  if (batchBusy.value) return;
  if (key.startsWith('filter:')) return selectFilter(key.slice(7));
  if (linkedFolder.value && filter.value !== 'bookmarks') {
    if (key === 'refresh') linkedRevision.value++;
    else actFolder(key, linkedFolder.value);
    return;
  }
  if (key === 'select') selecting.value ? stopSelecting() : (selecting.value = true);
  else if (key === 'all') showAll.value = !showAll.value;
  else if (key === 'link') {
    linkError.value = '';
    linkOpen.value = true;
  } else if (key === 'upload') void upload();
  else if (key === 'refresh') {
    void load();
    void bookmarks.load();
  } else if (key === 'new-folder') folderAction.value = { kind: 'create' };
  else if (key === 'cleanup') cleanupOpen.value = true;
  else if (['icons', 'compact', 'details'].includes(key)) viewState.value.mode = key;
}
const menuItems = (blob: LibraryBlob) => [
  { key: 'rename', label: tr('重命名', 'Rename'), icon: 'pencil' },
  { key: 'select', label: tr('多选文件', 'Select files'), icon: 'check' },
  { key: 'mention', label: i18n.t('library.mention'), icon: 'at-sign' },
  ...(supportsFolders.value ? [{ key: 'move', label: tr('移动到…', 'Move to…'), icon: 'folder' }] : []),
  {
    key: blob.visible === false ? 'show' : 'hide',
    label: blob.visible === false ? tr('加入展示库', 'Show in Library') : tr('从库中隐藏', 'Hide from Library'),
    icon: blob.visible === false ? 'eye' : 'eye-off',
  },
  {
    key: blob.pinned ? 'unpin' : 'pin',
    label: blob.pinned ? tr('取消置顶', 'Unpin') : tr('置顶', 'Pin to top'),
    icon: 'pin',
    checked: !!blob.pinned,
  },
  { key: 'delete', label: tr('删除文件', 'Delete file'), icon: 'trash-2', danger: true, separator: true },
];
const previewActions = computed(() =>
  selected.value
    ? [
        { key: 'refresh', label: tr('刷新', 'Refresh'), icon: 'refresh-cw' },
        ...(previewRef.value?.canCopy ? [{ key: 'copy', label: tr('复制全文', 'Copy all text'), icon: 'copy' }] : []),
        ...(previewRef.value?.canWrap
          ? [{ key: 'wrap', label: tr('自动换行', 'Wrap lines'), icon: 'wrap-text', checked: prefs.sourceWrap.value }]
          : []),
        { key: 'download', label: i18n.t('library.download'), icon: 'download' },
        ...menuItems(selected.value).filter((item) => item.key !== 'select'),
      ]
    : [],
);
const downloading = ref<string>();
const previewBusy = computed(
  () =>
    !!previewRef.value?.loading || !!downloading.value || (!!selected.value && updating.value.has(selected.value.id)),
);
let downloadController: AbortController | undefined;
watch([() => props.session, active, () => selected.value?.id], () => {
  downloadController?.abort();
  downloadController = undefined;
  downloading.value = undefined;
});
onBeforeUnmount(() => downloadController?.abort());
async function downloadPreview(blob: LibraryBlob) {
  if (downloadController) return;
  const request = new AbortController();
  downloadController = request;
  downloading.value = blob.id;
  try {
    await saveApiFile(blobUrl(`${props.session}/${blob.id}`), blob.name || filename(blob), request.signal);
  } finally {
    if (downloadController === request) {
      downloadController = undefined;
      downloading.value = undefined;
    }
  }
}
function previewAction(key: string) {
  const blob = selected.value;
  if (!blob || batchBusy.value || previewBusy.value) return;
  if (key === 'refresh') previewRef.value?.refresh();
  else if (key === 'copy')
    void previewRef.value?.copy().then((copied) => {
      if (copied) toast(tr('已复制', 'Copied'));
    });
  else if (key === 'wrap') prefs.setSourceWrap(!prefs.sourceWrap.value);
  else if (key === 'download') void downloadPreview(blob);
  else if (key === 'delete') deleteTargets.value = [blob];
  else void act(key, blob);
}
type LibraryAction = 'pin' | 'unpin' | 'show' | 'hide' | 'delete';
async function changeBlob(key: LibraryAction, blob: LibraryBlob, owner: string, signal?: AbortSignal) {
  if (key === 'delete') {
    await deleteBlob(`${owner}/${blob.id}`, { signal });
    if (owner === props.session && selected.value?.id === blob.id) selectBlob(null);
  } else {
    const state = await updateBlobLibrary(
      `${owner}/${blob.id}`,
      key === 'pin' || key === 'unpin' ? { pinned: key === 'pin' } : { visible: key === 'show' },
      { signal },
    );
    if (owner === props.session && selected.value?.id === blob.id) selected.value = { ...selected.value, ...state };
  }
}
async function act(key: string, blob: LibraryBlob) {
  if (batchBusy.value) return;
  if (key === 'select') {
    selecting.value = true;
    chosen.value = new Set([blob.id]);
    selectionAnchor = blob.id;
    return;
  }
  if (key === 'rename') {
    renameTarget.value = blob;
    return;
  }
  if (key === 'mention') return mention(blob);
  if (key === 'move') {
    folderAction.value = { kind: 'move', ids: [blob.id], from: blob.folder ?? null };
    return;
  }
  if (!['pin', 'unpin', 'show', 'hide', 'delete'].includes(key)) return;
  if (updating.value.has(blob.id)) return;
  const owner = props.session;
  updating.value.add(blob.id);
  try {
    await changeBlob(key as LibraryAction, blob, owner);
    if (owner !== props.session) return;
    await reload(true);
  } catch (cause) {
    toast(describeError(cause).message);
  } finally {
    updating.value.delete(blob.id);
  }
}
function mention(blob: LibraryBlob) {
  emit('mention', [attachmentReference(blob)]);
}
function attachmentReference(blob: LibraryBlob): StoredAttachmentReference {
  return { owner: props.session, id: blob.id, mime: blob.mime_type, name: filename(blob), size: blob.byte_count };
}
const filename = (blob: LibraryBlob) => blobName(blob, names.value);
const title = computed(() => (selected.value ? filename(selected.value) : i18n.t('library.title')));
const shown = computed(() => items.value.filter((blob) => filter.value === 'all' || blobKind(blob) === filter.value));
type LibraryItem = LibraryBlob | LibraryBookmark;
function isBookmark(item: LibraryItem): item is LibraryBookmark {
  return 'seq' in item;
}
const shownBookmarks = computed(() =>
  !folder.value && (filter.value === 'all' || filter.value === 'bookmarks') ? bookmarks.items.value : [],
);
const gridFolders = computed(() => (filter.value === 'bookmarks' ? [] : childFolders.value));
const catalogItems = computed<LibraryItem[]>(() => {
  const saved = [...shownBookmarks.value].sort((a, b) => b.created_at - a.created_at);
  const combined: LibraryItem[] = [];
  let index = 0;
  // Keep server file order intact: pagination and file range selection use that same order.
  for (const blob of shown.value) {
    if (!blob.pinned)
      while (index < saved.length && saved[index]!.created_at >= blob.modified_at) combined.push(saved[index++]!);
    combined.push(blob);
  }
  return combined.concat(saved.slice(index));
});
const chosenFiles = computed(() => shown.value.filter((blob) => chosen.value.has(blob.id)));
const allChosen = computed(() => shown.value.length > 0 && shown.value.every((blob) => chosen.value.has(blob.id)));
const allPinned = computed(() => chosenFiles.value.length > 0 && chosenFiles.value.every((blob) => blob.pinned));
const allHidden = computed(
  () => chosenFiles.value.length > 0 && chosenFiles.value.every((blob) => blob.visible === false),
);
function activateBlob(blob: LibraryBlob, event: MouseEvent) {
  if (batchBusy.value || event.button !== 0) return;
  if (!selecting.value && !event.shiftKey) return selectBlob(blob);
  selecting.value = true;
  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  if (event.shiftKey && selectionAnchor) {
    const ids = shown.value.map((item) => item.id);
    const start = ids.indexOf(selectionAnchor),
      end = ids.indexOf(blob.id);
    if (start >= 0 && end >= 0) {
      chosen.value = new Set([...chosen.value, ...ids.slice(Math.min(start, end), Math.max(start, end) + 1)]);
      return;
    }
  }
  const next = new Set(chosen.value);
  if (next.has(blob.id)) next.delete(blob.id);
  else next.add(blob.id);
  chosen.value = next;
  selectionAnchor = blob.id;
}
function chooseAll() {
  chosen.value = allChosen.value ? new Set() : new Set(shown.value.map((blob) => blob.id));
  selectionAnchor = undefined;
}
function mentionChosen() {
  const files = chosenFiles.value.map(attachmentReference);
  stopSelecting();
  emit('mention', files);
}
watch([shown, batchBusy], () => {
  // A batch refresh reloads all previously loaded pages before reconciling selection.
  if (batchBusy.value) return;
  const ids = new Set(shown.value.map((blob) => blob.id));
  chosen.value = new Set([...chosen.value].filter((id) => ids.has(id)));
  if (selectionAnchor && !ids.has(selectionAnchor)) selectionAnchor = undefined;
});
async function actOnChosen(key: LibraryAction, targets = [...chosenFiles.value]) {
  if (batchBusy.value || !targets.length) return;
  const owner = props.session;
  const origin = folder.value;
  const loaded = items.value.length;
  const request = new AbortController();
  const current = () => !request.signal.aborted && owner === props.session && origin === folder.value && active.value;
  batchController = request;
  batchBusy.value = true;
  const failures: { id: string; message: string }[] = [];
  try {
    for (const [index, blob] of targets.entries()) {
      if (!current()) return;
      batchProgress.value = `${index + 1} / ${targets.length}`;
      try {
        await changeBlob(key, blob, owner, request.signal);
      } catch (cause) {
        if (!current()) return;
        failures.push({ id: blob.id, message: `${filename(blob)}: ${describeError(cause).message}` });
      }
    }
    if (!current()) return;
    deleteTargets.value = [];
    await reload(true);
    while (current() && next.value !== null && items.value.length < loaded) {
      const before = items.value.length;
      await load(true, true);
      if (items.value.length === before) break;
    }
    if (!current()) return;
    if (failures.length) {
      if (selecting.value) chosen.value = new Set(failures.map((failure) => failure.id));
      toast(failures.map((failure) => failure.message).join('\n'));
    } else stopSelecting();
  } finally {
    if (batchController === request) {
      batchController = undefined;
      batchBusy.value = false;
    }
  }
}
const gridViewport = ref<HTMLElement>();
const grid = useVirtualGrid(
  gridViewport,
  computed(() => catalogItems.value.length + gridFolders.value.length),
  view,
);
useTouchRangeSelection(
  gridViewport,
  computed(() => selecting.value && !batchBusy.value),
  () => shown.value.map((item) => item.id),
  chosen,
  'data-blob-id',
);
const visibleFolders = computed(() => gridFolders.value.slice(grid.start.value, grid.end.value));
const visibleItems = computed(() =>
  catalogItems.value.slice(
    Math.max(0, grid.start.value - gridFolders.value.length),
    Math.max(0, grid.end.value - gridFolders.value.length),
  ),
);
watch(filter, (value) => {
  stopSelecting();
  grid.reset();
  saved.value.filter = value;
  saved.value.scroll = 0;
});
watch([() => props.session, folder], () => {
  grid.reset();
  renameTarget.value = undefined;
  opening++;
});
watch(showAll, () => {
  stopSelecting();
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
const filters = ['all', 'bookmarks', 'image', 'video', 'audio', 'pdf', 'text', 'file'] as const;
const filterOptions = computed(() =>
  filters.map((kind) => ({
    value: kind,
    label:
      kind === 'bookmarks'
        ? tr('书签', 'Bookmarks')
        : kind === 'all'
          ? i18n.t('library.kind.all')
          : i18n.t(`library.kind.${kind}`),
    icon: kind === 'bookmarks' ? 'bookmark' : kind === 'all' ? 'library' : kind === 'pdf' ? 'file-pdf' : blobIcon(kind),
  })),
);
function selectFilter(value: string) {
  const kind = filters.find((kind) => kind === value);
  if (kind) filter.value = kind;
}
function parentFolder() {
  if (linkedBrowser.value?.back()) return;
  if (folder.value) openFolder(trail.value.at(-1)?.parent ?? null);
}
function back() {
  if (selecting.value) stopSelecting();
  else if (selected.value) selectBlob(null);
  else if (localDirectory.value) {
    opening++;
    localTrail.value.pop();
  } else if (filter.value === 'bookmarks') filter.value = 'all';
  else if (folder.value) parentFolder();
  else emit('close');
}
useBackLayer(
  () => props.open && props.mobile && selecting.value,
  stopSelecting,
  () => 48,
);
useBackLayer(
  () => props.open && props.mobile,
  back,
  () => 45,
);
useBackLayer(
  () => props.open && props.mobile && !!selected.value,
  () => {
    selectBlob(null);
  },
  () => 47,
);
useBackLayer(
  () => props.open && props.mobile && (!!folder.value || filter.value === 'bookmarks'),
  back,
  () => 46,
);
watch(
  () => props.libraryRevision,
  () => {
    localTrail.value = [];
    selectBlob(null);
  },
);
watch(
  () => props.session,
  () => {
    localTrail.value = [];
  },
);
let controller: AbortController | undefined;
function reload(quiet = false) {
  controller?.abort();
  loading.value = false;
  return load(false, quiet);
}
onBeforeUnmount(
  bus.on('library.files.changed', ({ session }) => {
    if (session === props.session) void reload(true);
  }),
);
async function load(more = false, quiet = false) {
  if (loading.value || !active.value) return;
  const request = new AbortController();
  controller = request;
  const owner = props.session;
  const origin = folder.value;
  loading.value = true;
  if (!quiet) error.value = '';
  try {
    const readPage = (scoped: boolean) =>
      sessionBlobs(owner, more ? (next.value ?? 0) : 0, {
        signal: request.signal,
        query: { include_hidden: showAll.value, ...(scoped ? { folder: origin ?? '/' } : {}) },
      });
    let page;
    try {
      page = await readPage(supportsFolders.value !== false);
    } catch (cause) {
      // Older servers reject unknown query fields. Only that compatibility path needs
      // a second request; current servers receive the desired folder on the first read.
      if (supportsFolders.value === undefined && cause instanceof ApiError && cause.status === 400) {
        page = await readPage(false);
      } else if (origin && cause instanceof ApiError && cause.status === 404) {
        // Verify the owner still exists and the saved folder was removed elsewhere.
        page = await readPage(false);
        if (
          !request.signal.aborted &&
          owner === props.session &&
          origin === folder.value &&
          Array.isArray(page.folders) &&
          !page.folders.some((item) => item.id === origin)
        ) {
          openFolder(null);
          return;
        }
        throw cause;
      } else throw cause;
    }
    if (request.signal.aborted || owner !== props.session || origin !== folder.value) return;
    supportsFolders.value = Array.isArray(page.folders);
    const known = new Map((more ? items.value : []).map((blob) => [blob.id, blob]));
    for (const blob of page.items) known.set(blob.id, blob);
    items.value = [...known.values()];
    next.value = page.next;
    total.value = page.total;
    folders.value = page.folders ?? [];
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
  [() => props.session, folder, active],
  (_, previous, onCleanup) => {
    const owner = props.session;
    const ownerChanged = owner !== previous?.[0];
    let disposed = false;
    controller?.abort();
    cancelOperations();
    loading.value = false;
    if (!active.value) return;
    drag.cancel();
    folderAction.value = undefined;
    cleanupOpen.value = false;
    if (ownerChanged) {
      folders.value = [];
      uploadedNames.value.clear();
    }
    deleteTargets.value = [];
    stopSelecting();
    linkOpen.value = false;
    localPath.value = '';
    linkError.value = '';
    loading.value = false;
    items.value = [];
    // Reopening refreshes the listing while retaining the mounted media viewer.
    if (ownerChanged || folder.value !== previous?.[1]) selected.value = null;
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
      if (
        active.value &&
        document.visibilityState !== 'hidden' &&
        !selected.value &&
        !selecting.value &&
        !batchBusy.value &&
        next.value === null
      ) {
        void load(false, true);
        void bookmarks.load();
      }
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
        v-if="selected || localDirectory"
        class="btn ghost icon-only"
        :aria-label="i18n.t('library.back')"
        @click="back"
      >
        <Icon name="arrow-left" />
      </button>
    </template>
    <template #title>
      <span v-if="!selected && localDirectory" class="library-file-title" :title="localDirectory.path"
        ><span>{{ localDirectory.path }}</span></span
      >
      <SessionSidebarTitle v-else-if="!selected" current="library" @select="emit('navigate', $event)" />
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
      <Menu
        v-if="!selected && !localDirectory"
        :items="libraryActions"
        :disabled="batchBusy"
        content-class="library-menu"
        @select="libraryAction"
      >
        <template #trigger>
          <button
            type="button"
            class="btn ghost icon-only library-menu-trigger"
            :class="{ active: selecting || showAll }"
            :aria-label="tr('文件库操作', 'Library actions')"
            :title="tr('文件库操作', 'Library actions')"
            :aria-busy="uploading || batchBusy"
          >
            <Icon
              :name="uploading || batchBusy ? 'loader-circle' : 'ellipsis-vertical'"
              :class="{ spin: uploading || batchBusy }"
            />
          </button>
        </template>
      </Menu>
      <Menu
        v-if="selected"
        :items="previewActions"
        :disabled="batchBusy || previewBusy"
        content-class="library-preview-menu"
        @select="previewAction"
      >
        <template #trigger>
          <button
            type="button"
            class="btn ghost icon-only library-preview-menu-trigger"
            :aria-label="tr('文件操作', 'File actions')"
            :title="tr('文件操作', 'File actions')"
            :aria-busy="previewBusy"
          >
            <Icon :name="previewBusy ? 'loader-circle' : 'ellipsis-vertical'" :class="{ spin: previewBusy }" />
          </button>
        </template>
      </Menu>
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
    <div v-else-if="localDirectory" class="library-scroll local-directory">
      <button v-for="name in localDirectory.directories" :key="name" @click="openLocalChild(name, true)">
        <Icon name="folder" /><span>{{ name }}</span
        ><Icon name="chevron-right" :size="14" />
      </button>
      <button v-for="name in localDirectory.files" :key="name" @click="openLocalChild(name, false)">
        <Icon name="instruction" /><span>{{ name }}</span>
      </button>
      <p v-if="!localDirectory.directories.length && !localDirectory.files?.length" class="library-empty">
        {{ tr('文件夹为空', 'Folder is empty') }}
      </p>
    </div>
    <template v-else>
      <div v-if="filter !== 'all'" class="library-filter-status">
        <span><Icon name="filter" :size="14" />{{ filterOptions.find((item) => item.value === filter)?.label }}</span>
        <button
          class="btn ghost icon-only sm"
          :aria-label="tr('清除筛选', 'Clear filter')"
          @click="selectFilter('all')"
        >
          <Icon name="x" :size="14" />
        </button>
      </div>
      <nav
        v-if="supportsFolders && (folder || drag.dragging.value)"
        class="library-path"
        :aria-label="tr('文件夹路径', 'Folder path')"
      >
        <button
          v-if="folder"
          type="button"
          class="btn ghost icon-only sm library-parent"
          :aria-label="tr('到父目录', 'Go to parent folder')"
          :title="tr('到父目录', 'Go to parent folder')"
          @click="parentFolder"
        >
          <Icon name="arrow-left" />
        </button>
        <button
          type="button"
          class="btn ghost sm"
          data-drop-place="/"
          :class="{ 'drop-target': drag.over.value === null }"
          @click="openFolder(null)"
          @dragenter="drag.hover($event, null)"
          @dragover="drag.hover($event, null)"
          @dragleave="drag.leave($event, null)"
          @drop="drag.drop($event, null)"
        >
          <Icon name="library" :size="14" />{{ i18n.t('library.title') }}
        </button>
        <template v-for="part in trail" :key="part.id">
          <Icon name="chevron-right" :size="12" />
          <button
            type="button"
            class="btn ghost sm"
            :data-drop-place="part.id"
            :class="{ 'drop-target': drag.over.value === part.id }"
            @click="openFolder(part.id)"
            @dragenter="drag.hover($event, part.id)"
            @dragover="drag.hover($event, part.id)"
            @dragleave="drag.leave($event, part.id)"
            @drop="drag.drop($event, part.id)"
          >
            {{ part.name }}
          </button>
        </template>
      </nav>
      <LibraryLinkedFolder
        v-if="linkedFolder"
        ref="linkedBrowser"
        :session="session"
        :folder="linkedFolder"
        :filter="filter"
        :revision="linkedRevision"
        @open="openLinkedChild"
      />
      <div
        v-else
        ref="gridViewport"
        class="library-scroll"
        :class="[{ selecting }, `library-view-${view}`]"
        :data-drop-place="folder ?? '/'"
        @scroll.passive="rememberGrid"
        @dragover="!$event.defaultPrevented && drag.hover($event, folder)"
        @drop="!$event.defaultPrevented && drag.drop($event, folder)"
      >
        <p v-if="showAll" class="library-all-hint">
          {{ tr('全部文件 · 可将需要的文件加入展示库', 'All files · Add files you need to your Library') }}
        </p>
        <div
          v-if="bookmarks.error.value && !folder && (filter === 'all' || filter === 'bookmarks')"
          class="library-empty"
          role="alert"
        >
          <p>{{ bookmarks.error.value }}</p>
          <button class="btn sm" @click="bookmarks.load()">{{ i18n.t('common.retry') }}</button>
        </div>
        <div v-if="error" class="library-empty" role="alert">
          <p>{{ error }}</p>
          <button class="btn sm" @click="load()">{{ i18n.t('common.retry') }}</button>
        </div>
        <p v-else-if="(loading || bookmarks.loading.value) && !catalogItems.length" class="library-empty" role="status">
          {{ i18n.t('common.loading') }}
        </p>
        <p v-else-if="!catalogItems.length && !gridFolders.length" class="library-empty">
          {{ i18n.t(items.length || bookmarks.items.value.length ? 'library.noMatches' : 'library.empty') }}
        </p>
        <div class="library-grid" :style="grid.style.value">
          <Menu
            v-for="item in visibleFolders"
            :key="item.id"
            context
            :items="folderMenu(item)"
            :disabled="batchBusy || selecting"
            @select="actFolder($event, item)"
          >
            <div
              class="library-card library-folder"
              :class="{ 'drop-target': drag.over.value === item.id }"
              :data-drop-place="item.linked_path ? undefined : item.id"
              :data-drop-opens="item.linked_path ? undefined : ''"
              @dragenter="!item.linked_path && drag.hover($event, item.id, true)"
              @dragover="!item.linked_path && drag.hover($event, item.id)"
              @dragleave="drag.leave($event, item.id)"
              @drop="!item.linked_path && drag.drop($event, item.id)"
            >
              <button
                type="button"
                class="library-item"
                :data-folder-id="item.id"
                :disabled="batchBusy"
                :draggable="!batchBusy"
                @click="openFolder(item.id)"
                @dragstart="drag.start($event, [item.id], folder)"
                @touchstart.passive="!selecting && !batchBusy && drag.press($event, [item.id], folder, item.name)"
              >
                <LibraryFolderThumbnail v-if="view === 'icons'" />
                <Icon v-else name="folder" class="library-file-icon" :size="view === 'compact' ? 22 : 32" />
                <span class="library-filename">{{ item.name }}</span>
                <span class="library-filesize"
                  ><Icon v-if="item.linked_path" name="link" :size="12" />{{ tr('文件夹', 'Folder') }}</span
                >
              </button>
              <Menu :items="folderMenu(item)" :disabled="batchBusy" @select="actFolder($event, item)">
                <template #trigger
                  ><button
                    type="button"
                    class="library-item-menu btn ghost icon-only"
                    :aria-label="tr('文件夹操作', 'Folder actions')"
                  >
                    <Icon name="ellipsis-vertical" :size="16" /></button
                ></template>
              </Menu>
            </div>
          </Menu>
          <template v-for="blob in visibleItems" :key="blob.id">
            <Menu
              v-if="isBookmark(blob)"
              context
              :items="bookmarks.actions()"
              :disabled="selecting || batchBusy || bookmarks.busy.value.has(blob.id)"
              @select="bookmarks.action($event, blob)"
            >
              <div class="library-card library-bookmark">
                <button
                  type="button"
                  class="library-item bookmark-open"
                  :data-bookmark-id="blob.id"
                  :aria-label="blob.name"
                  :disabled="selecting || batchBusy || bookmarks.busy.value.has(blob.id)"
                  @click="bookmarks.locate(blob)"
                >
                  <LibraryDocumentThumbnail v-if="view === 'icons'" :text="blob.text" bookmark />
                  <Icon v-else class="library-file-icon" name="bookmark" :size="view === 'compact' ? 22 : 32" />
                  <span class="library-filename" :title="blob.name">{{ blob.name }}</span>
                  <span v-if="view === 'details'" class="library-file-details">{{ fmtDateTime(blob.created_at) }}</span>
                  <span class="library-filesize">{{
                    blob.block == null ? tr('消息书签', 'Message bookmark') : tr('片段书签', 'Excerpt bookmark')
                  }}</span>
                </button>
                <Menu
                  v-if="!selecting"
                  :items="bookmarks.actions()"
                  :disabled="batchBusy || bookmarks.busy.value.has(blob.id)"
                  @select="bookmarks.action($event, blob)"
                >
                  <template #trigger
                    ><button
                      class="library-item-menu btn ghost icon-only"
                      :aria-label="tr('书签操作', 'Bookmark actions')"
                    >
                      <Icon name="ellipsis-vertical" :size="16" /></button
                  ></template>
                </Menu>
              </div>
            </Menu>
            <Menu
              v-else
              context
              :items="menuItems(blob)"
              :disabled="selecting || batchBusy || updating.has(blob.id)"
              @select="act($event, blob)"
            >
              <div
                class="library-card"
                :class="{ 'library-hidden': blob.visible === false, chosen: chosen.has(blob.id) }"
              >
                <div v-if="blob.pinned || blob.visible === false" class="library-badges">
                  <span v-if="blob.pinned" :title="tr('已置顶', 'Pinned')"><Icon name="pin" :size="13" /></span>
                  <span v-if="blob.visible === false" :title="tr('未在库中展示', 'Hidden from Library')"
                    ><Icon name="eye-off" :size="13"
                  /></span>
                </div>
                <button
                  type="button"
                  class="library-item"
                  :data-blob-id="blob.id"
                  :draggable="supportsFolders && !batchBusy"
                  :disabled="batchBusy"
                  :aria-pressed="selecting ? chosen.has(blob.id) : undefined"
                  :aria-label="filename(blob)"
                  :title="blob.local_path || undefined"
                  @mousedown="$event.shiftKey && $event.preventDefault()"
                  @dragstart="dragFile(blob, $event)"
                  @touchstart.passive="pressFile(blob, $event)"
                  @click="activateBlob(blob, $event)"
                >
                  <LibraryThumbnail v-if="view === 'icons'" :session="session" :blob="blob" />
                  <Icon
                    v-else
                    class="library-file-icon"
                    :name="blobIcon(blobKind(blob))"
                    :size="view === 'compact' ? 22 : 32"
                  />
                  <span v-if="selecting" class="library-check" aria-hidden="true"
                    ><Icon v-if="chosen.has(blob.id)" name="check" :size="14"
                  /></span>
                  <span class="library-filename" :title="filename(blob)">{{ filename(blob) }}</span>
                  <span v-if="view === 'details'" class="library-file-details"
                    >{{ blob.mime_type }} · {{ fmtDateTime(blob.modified_at) }}</span
                  >
                  <span class="library-filesize"
                    ><Icon v-if="blob.linked" name="link" :size="12" />{{
                      blob.available === false ? i18n.t('library.unavailable') : fmtBytes(blob.byte_count)
                    }}</span
                  >
                </button>
                <Menu
                  v-if="!selecting"
                  :items="menuItems(blob)"
                  :disabled="batchBusy || updating.has(blob.id)"
                  :label="i18n.t('library.fileActions')"
                  @select="act($event, blob)"
                >
                  <template #trigger>
                    <button
                      type="button"
                      class="library-item-menu btn ghost icon-only"
                      :aria-label="i18n.t('library.fileActions')"
                    >
                      <Icon name="ellipsis-vertical" :size="16" />
                    </button>
                  </template>
                </Menu>
              </div>
            </Menu>
          </template>
        </div>
        <button
          v-if="next !== null && filter !== 'bookmarks'"
          type="button"
          class="btn library-more"
          :disabled="loading || batchBusy"
          @click="load(true)"
        >
          {{ i18n.t(loading ? 'common.loading' : 'library.more') }}
        </button>
      </div>
    </template>
    <template v-if="selecting && !selected" #footer>
      <div class="library-selection-wrap">
        <div class="library-selection" role="toolbar" :aria-label="tr('已选文件操作', 'Selected file actions')">
          <div class="library-selection-head">
            <button
              type="button"
              class="btn ghost icon-only"
              :aria-label="tr('退出多选', 'Stop selecting')"
              :title="tr('退出多选（Esc）', 'Stop selecting (Esc)')"
              @click="stopSelecting"
            >
              <Icon name="x" />
            </button>
            <span role="status">{{
              batchBusy
                ? tr(`处理中 ${batchProgress}`, `Processing ${batchProgress}`)
                : tr(`已选 ${chosenFiles.length} 个文件`, `${chosenFiles.length} files selected`)
            }}</span>
            <button
              type="button"
              class="btn ghost library-select-all"
              :disabled="batchBusy || !shown.length"
              @click="chooseAll"
            >
              {{
                allChosen
                  ? tr('取消全选', 'Clear all')
                  : next !== null
                    ? tr('全选已加载', 'Select loaded')
                    : tr('全选', 'Select all')
              }}
            </button>
          </div>
          <div class="library-selection-actions">
            <button
              v-if="supportsFolders"
              type="button"
              class="btn library-batch-move"
              :disabled="batchBusy || !chosenFiles.length"
              @click="folderAction = { kind: 'move', ids: [...chosen], from: folder }"
            >
              <Icon name="folder" />{{ tr('移动', 'Move') }}
            </button>
            <button
              type="button"
              class="btn library-batch-mention"
              :disabled="batchBusy || !chosenFiles.length"
              :title="i18n.t('library.mention')"
              @click="mentionChosen"
            >
              <Icon name="at-sign" />{{ tr('引用', 'Mention') }}
            </button>
            <button
              type="button"
              class="btn library-batch-pin"
              :disabled="batchBusy || !chosenFiles.length"
              @click="actOnChosen(allPinned ? 'unpin' : 'pin')"
            >
              <Icon name="pin" />{{ allPinned ? tr('取消置顶', 'Unpin') : tr('置顶', 'Pin') }}
            </button>
            <button
              type="button"
              class="btn library-batch-visible"
              :disabled="batchBusy || !chosenFiles.length"
              @click="actOnChosen(allHidden ? 'show' : 'hide')"
            >
              <Icon :name="allHidden ? 'eye' : 'eye-off'" />{{ allHidden ? tr('显示', 'Show') : tr('隐藏', 'Hide') }}
            </button>
            <button
              type="button"
              class="btn danger library-batch-delete"
              :disabled="batchBusy || !chosenFiles.length"
              @click="deleteTargets = [...chosenFiles]"
            >
              <Icon name="trash-2" />{{ tr('删除', 'Delete') }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </IslandSidebar>
  <LibraryRenameDialog
    :open="!!bookmarks.editing.value"
    :name="bookmarks.editing.value?.name ?? ''"
    :save="bookmarks.rename"
    @close="bookmarks.editing.value = undefined"
    @saved="bookmarks.load()"
  />
  <LibraryRenameDialog
    :open="!!renameTarget"
    :name="renameTarget ? filename(renameTarget) : ''"
    :save="renameFile"
    @close="renameTarget = undefined"
  />
  <LibraryFolderDialog
    :session="session"
    :parent="folder"
    :folders="folders"
    :action="folderAction"
    @close="folderAction = undefined"
    @changed="folderChanged"
  />
  <LibraryCleanupDialog :session="session" :open="cleanupOpen" @close="cleanupOpen = false" @cleaned="folderChanged" />
  <Teleport to="body">
    <div
      v-if="drag.ghost.value"
      class="sl-touch-ghost"
      :style="{ transform: `translate(${drag.ghost.value.x}px, ${drag.ghost.value.y}px)` }"
      aria-hidden="true"
    >
      <Icon name="folder" />{{ drag.ghost.value.label }}
    </div>
  </Teleport>
  <Modal
    compact
    :open="deleteTargets.length > 0"
    :dismissable="!batchBusy"
    :title="tr(`删除 ${deleteTargets.length} 个文件？`, `Delete ${deleteTargets.length} files?`)"
    @close="deleteTargets = []"
  >
    <p>
      {{
        tr(
          '文件将从此会话的库中永久删除；链接文件的原文件会保留。',
          'Files will be permanently removed from this session’s Library. Linked originals will be kept.',
        )
      }}
    </p>
    <template #footer>
      <button type="button" class="btn ghost" :disabled="batchBusy" @click="deleteTargets = []">
        {{ tr('取消', 'Cancel') }}
      </button>
      <button
        type="button"
        class="btn danger solid library-confirm-delete"
        :disabled="batchBusy"
        @click="actOnChosen('delete', [...deleteTargets])"
      >
        <Icon v-if="batchBusy" name="loader-circle" class="spin" />{{ tr('删除', 'Delete') }}
      </button>
    </template>
  </Modal>
  <Modal
    compact
    :open="linkOpen"
    :sheet="mobile"
    :dismissable="!linking"
    :title="i18n.t('library.linkFile')"
    @close="linkOpen = false"
  >
    <form :id="linkFormId" class="library-link-form" @submit.prevent="addLink">
      <p>
        {{ i18n.t('library.linkHint') }}
      </p>
      <div class="library-path-picker">
        <textarea
          v-model="localPath"
          rows="4"
          class="input"
          data-initial-focus
          :aria-label="i18n.t('library.localPath')"
          :placeholder="
            tr('文件或文件夹路径，每行一个（最多 100 项）', 'File or folder paths, one per line (up to 100)')
          "
          :disabled="linking"
        />
        <DirectoryPicker
          :model-value="linkPaths[0] ?? ''"
          :selected-paths="linkPaths"
          multiple
          mode="entry"
          side="bottom"
          :disabled="linking"
          @select-paths="chooseLinks"
        >
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
      <p v-if="linkError" role="alert" class="library-link-error">{{ linkError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn ghost" :disabled="linking" @click="linkOpen = false">
        {{ tr('取消', 'Cancel') }}
      </button>
      <button
        :form="linkFormId"
        type="submit"
        class="btn primary"
        :disabled="linking || !linkPaths.length || linkPaths.length > 100"
      >
        {{ linking ? i18n.t('common.loading') : tr(`链接 ${linkPaths.length} 项`, `Link ${linkPaths.length} items`) }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.local-directory button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 6px 12px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--line);
  color: var(--fg);
  text-align: start;
  cursor: pointer;
}
.local-directory button:hover {
  background: var(--bg-hover);
}
.local-directory button span {
  flex: 1;
  overflow-wrap: anywhere;
}
.library-link-error {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.library-path-picker textarea {
  resize: vertical;
}
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
.library-filter-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px 8px;
}
.library-filter-status > span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-muted);
  font-size: 12px;
}
.library-card {
  width: 100%;
  max-width: 180px;
  position: relative;
  min-width: 0;
}
.library-menu-trigger.active {
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
.library-path {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 10px 8px;
  overflow-x: auto;
  flex: none;
}
.library-path .btn {
  flex: none;
  white-space: nowrap;
}
.library-path .drop-target,
.library-folder.drop-target {
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 10px;
}
.library-view-icons .library-folder .library-item:focus-visible {
  box-shadow: none;
}
.library-folder .library-item:focus-visible .library-folder-thumbnail {
  border-color: var(--accent);
}
.library-file-icon {
  color: var(--fg-muted);
  grid-column: 1;
  grid-row: 1 / 3;
}
.library-file-details {
  font-size: 11px;
  line-height: 18px;
  color: var(--fg-subtle);
  grid-column: 2;
  grid-row: 2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
:is(.library-view-compact, .library-view-details) .library-card {
  max-width: none;
  border-radius: 8px;
}
:is(.library-view-compact, .library-view-details) .library-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  column-gap: 8px;
  row-gap: 0;
  height: 100%;
  padding: 3px 34px 3px 6px;
  border-radius: 8px;
}
:is(.library-view-compact, .library-view-details) .library-filename {
  grid-column: 2;
  grid-row: 1;
}
:is(.library-view-compact, .library-view-details) .library-filesize {
  grid-column: 3;
  grid-row: 1 / 3;
  white-space: nowrap;
}
:is(.library-view-compact, .library-view-details) .library-item-menu {
  top: 50%;
  bottom: auto;
  transform: translateY(-50%);
}
:is(.library-view-compact, .library-view-details) .library-card.chosen {
  background: var(--accent-soft);
}
:is(.library-view-compact, .library-view-details) .library-check {
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
}
:is(.library-view-compact, .library-view-details) .library-badges {
  inset: 2px auto auto 4px;
}
.library-view-compact .library-item {
  grid-template-rows: 1fr;
  grid-template-columns: 24px minmax(0, 1fr) auto;
}
.library-view-compact :is(.library-file-icon, .library-filesize) {
  grid-row: 1;
}
:is(.library-view-compact, .library-view-details) .library-item:focus-visible {
  box-shadow: inset 0 0 0 1px var(--accent);
}
.library-folder .library-item:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--accent);
}
.library-view-details .library-item {
  grid-template-rows: 1fr 1fr;
}
.library-view-details .library-folder .library-filename {
  grid-row: 1 / 3;
}
@media (hover: hover) {
  :is(.library-view-compact, .library-view-details) .library-item:hover {
    background: var(--bg-hover);
  }
}
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 112px), 1fr));
  gap: 18px 12px;
}
.library-item {
  position: relative;
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
/* Keep the keyboard focus indicator on the thumbnail, clear of the filename and size. */
.library-item:focus-visible {
  border: 0 !important;
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
.selecting .library-item {
  user-select: none;
}
.library-card.chosen :deep(.library-thumbnail),
.library-item:focus-visible :deep(.library-thumbnail) {
  border-color: var(--accent);
}
.library-card.chosen :deep(.library-thumbnail) {
  background-color: var(--accent-soft);
}
.library-check {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--fg-subtle);
  border-radius: 6px;
  background: var(--bg-raised);
  color: var(--bg);
  pointer-events: none;
}
.chosen .library-check {
  border-color: var(--accent);
  background: var(--accent);
}
.library-selection-wrap {
  flex: none;
  padding: 8px 12px max(12px, env(safe-area-inset-bottom));
}
.library-selection {
  width: 100%;
  max-width: 480px;
  margin-inline: auto;
  padding: 8px 10px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  background: var(--bg-raised);
  box-shadow: var(--shadow-pop);
}
.library-selection-head,
.library-selection-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.library-selection-head {
  margin-bottom: 8px;
  font-size: 12px;
}
.library-selection-head > span {
  flex: 1;
  min-width: 0;
}
.library-selection-head .btn {
  flex: none;
}
.library-selection-actions {
  flex-wrap: wrap;
}
.library-selection-actions .btn {
  flex: 1 0 auto;
  min-height: 32px;
  padding: 6px 8px;
  font-size: 12px;
  gap: 4px;
}
.library-selection-actions .icon {
  width: 16px;
  height: 16px;
}
@media (hover: hover) {
  .library-item:hover :deep(.library-thumbnail) {
    border-color: var(--accent);
  }
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
.library-media-toolbar:empty {
  display: none;
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
