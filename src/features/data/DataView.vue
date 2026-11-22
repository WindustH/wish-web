<script setup lang="ts">
import { confirmArchive, exportSessions, sessionPackageActions } from '../sessions/sessionPackages.ts';
// Session storage and usage records: a window on desktop, a page on mobile.
// Rows show history, attachments and command output; selections support bulk deletion/pruning.
import { computed, onActivated, onDeactivated, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import Menu from '../../ui/components/Menu.vue';
import type { MenuItem } from '../../ui/components/menuTypes.ts';
import RefreshStamp from '../../ui/components/RefreshStamp.vue';
import Spinner from '../../ui/components/Spinner.vue';
import SessionListAction, { type ActionTarget } from '../sessions/SessionListAction.vue';
import PruneDialog from '../sessions/PruneDialog.vue';
import OverlayWindow from '../../ui/components/OverlayWindow.vue';
import DataCheckbox from './DataCheckbox.vue';
import StorageSessionPreview from './StorageSessionPreview.vue';
import DataRow, { type DataItem } from './DataRow.vue';
import ArchivesList from './ArchivesList.vue';
import SelectField from '../../ui/components/SelectField.vue';
import { bus } from '../../core/bus.ts';
import StorageCard from './StorageCard.vue';
import UsageRecords from './UsageRecords.vue';
import DeleteSessionsDialog from '../sessions/DeleteSessionsDialog.vue';
import * as api from '../../core/api/endpoints.ts';
import type { SessionBytes, StorageSnapshot, PruneResult } from '../../core/api/endpoints.ts';
import type { ArchiveRecord } from '../../core/api/types.ts';
import { createCachedResource } from '../../core/util/cachedResource.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { sessions, sessionTitle } from '../../core/state/sessionsSlice.ts';

const router = useRouter();
const view = ref('sessions'),
  archiveCount = ref<number>();
const removingArchives = ref(new Map<string, number>());
const archiveRevision = ref(0);
const views = computed(() => [
  { value: 'sessions', label: tr('活跃会话', 'Active sessions') + ' (' + (snapshot.value?.sessions ?? 0) + ')' },
  {
    value: 'archives',
    label:
      tr('已归档', 'Archived') +
      (archiveCount.value != null ? ' (' + Math.max(0, archiveCount.value - removingArchives.value.size) + ')' : ''),
  },
]);
let active = false;
const unsubscribe = bus.on('archives.changed', () => {
  if (active) void refreshAll();
});
onBeforeUnmount(unsubscribe);
onActivated(() => (active = true));
onDeactivated(() => (active = false));
const selectionBar = ref<HTMLElement>();
const selectionHeight = ref(0);
watch(selectionBar, (bar, _, cleanup) => {
  selectionHeight.value = bar?.getBoundingClientRect().height ?? 0;
  if (!bar) return;
  const observer = new ResizeObserver(() => {
    selectionHeight.value = bar.getBoundingClientRect().height;
  });
  observer.observe(bar);
  cleanup(() => observer.disconnect());
});

type Snapshot = {
  items: DataItem[];
  sessions: number;
  bytes: SessionBytes;
  storage: StorageSnapshot | null;
  at: number;
};
// The last reading shows at once; a fresh one replaces it.
const reading = createCachedResource(
  async (_: void, signal): Promise<Snapshot> => {
    const [found, storage] = await Promise.all([
      api.sessionsStorage({ signal }),
      api.storageStatus({ signal }).catch(() => null),
    ]);
    const items: DataItem[] = [...found.sessions.map((item) => ({ kind: 'session' as const, ...item }))];
    return {
      items,
      sessions: found.sessions.length,
      bytes: found.bytes,
      storage,
      at: Date.now(),
    };
  },
  () => ({ key: 'data-sessions-v2', persist: true }),
);
const snapshot = computed(() => reading.data.value ?? undefined);
onBeforeUnmount(
  bus.on('tombstone.session', ({ id }) => {
    const data = reading.data.value;
    if (!data || !data.items.some((item) => item.id === id)) return;
    reading.data.value = { ...data, items: data.items.filter((item) => item.id !== id), sessions: data.sessions - 1 };
  }),
);
function withoutArchives(storage: StorageSnapshot, bytes: number): StorageSnapshot {
  return {
    ...storage,
    bytes: {
      ...storage.bytes,
      archives: Math.max(0, (storage.bytes.archives ?? 0) - bytes),
      total: Math.max(0, storage.bytes.total - bytes),
    },
  };
}
const storageShown = computed(() => {
  const storage = snapshot.value?.storage;
  const bytes = [...removingArchives.value.values()].reduce((sum, size) => sum + size, 0);
  return storage && bytes ? withoutArchives(storage, bytes) : storage;
});
const loading = reading.loading;
const failed = reading.error;
const estimate = createCachedResource<PruneResult, void>((_, signal) =>
  api.storagePrune({ dry_run: true, before: null }, { signal }),
);
let generation = 0;
let archiveCountRequest: AbortController | undefined;
function archiveRemoving(row: ArchiveRecord, request: Promise<unknown>) {
  archiveCountRequest?.abort();
  reading.cancel();
  removingArchives.value.set(row.archive_id, row.archive_bytes);
  void request.then(
    () => {
      removingArchives.value.delete(row.archive_id);
      if (archiveCount.value != null) archiveCount.value = Math.max(0, archiveCount.value - 1);
      const data = reading.data.value;
      if (data?.storage) reading.data.value = { ...data, storage: withoutArchives(data.storage, row.archive_bytes) };
    },
    () => removingArchives.value.delete(row.archive_id),
  );
}
function refreshAll() {
  archiveRevision.value++;
  return refresh();
}
async function refresh() {
  const current = ++generation;
  archiveCountRequest?.abort();
  const count = (archiveCountRequest = new AbortController());
  estimate.reset();
  void api
    .archivesList({ limit: 1 }, { signal: count.signal })
    .then((r) => {
      if (!count.signal.aborted) archiveCount.value = r.total;
    })
    .catch(() => {
      if (!count.signal.aborted) archiveCount.value = undefined;
    });
  await reading.load();
  if (current === generation && snapshot.value?.sessions) void estimate.load();
}
function cancelReads() {
  previewItem.value = undefined;
  generation++;
  archiveCountRequest?.abort();
  reading.cancel();
  estimate.cancel();
}
onActivated(refreshAll);
onDeactivated(cancelReads);
onBeforeUnmount(cancelReads);

// Finding and ordering.
const query = ref('');
const order = ref('size');
const orders = computed<MenuItem[]>(() =>
  [
    { key: 'size', icon: 'storage', label: tr('占用最大', 'Largest') },
    { key: 'oldest', icon: 'clock', label: tr('最久未用', 'Least recently active') },
    { key: 'updated', icon: 'clock', label: tr('最近活跃', 'Recently active') },
    { key: 'attachments', icon: 'paperclip', label: tr('附件最大', 'Largest attachments') },
    { key: 'shell', icon: 'terminal', label: tr('输出最大', 'Largest output') },
  ].map((item) => ({ ...item, checked: item.key === order.value })),
);
const orderLabel = computed(() => orders.value.find((item) => item.checked)?.label ?? '');
const shown = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const list = (snapshot.value?.items ?? []).filter((item) => {
    if (sessions.removing.value.has(item.id)) return false;
    const text =
      `${item.name} ${item.id} ${(item.kind === 'session' ? (item.tags ?? []) : []).join(' ')}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const by: Record<string, (a: DataItem, b: DataItem) => number> = {
    updated: (a, b) => b.updated_at - a.updated_at,
    size: (a, b) => b.bytes.total - a.bytes.total,
    oldest: (a, b) => a.updated_at - b.updated_at,
    attachments: (a, b) => b.bytes.attachments - a.bytes.attachments || b.bytes.total - a.bytes.total,
    shell: (a, b) => b.bytes.shell - a.bytes.shell || b.bytes.total - a.bytes.total,
  };
  return [...list].sort(by[order.value] ?? by.updated);
});
const page = ref(0);
const pageSize = 100;
const pageCount = computed(() => Math.max(1, Math.ceil(shown.value.length / pageSize)));
const pageItems = computed(() => shown.value.slice(page.value * pageSize, (page.value + 1) * pageSize));
const pageMaxBytes = computed(() => Math.max(0, ...pageItems.value.map((item) => item.bytes.total)));
const runningCount = computed(() => snapshot.value?.items.filter((item) => item.running).length ?? 0);

watch([query, order], () => {
  page.value = 0;
});
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count - 1);
});

// What a session's bytes are made of, in the order the bars show them.
const parts = computed(() => [
  { key: 'history' as const, label: tr('对话记录', 'History'), color: 'var(--chart-1)' },
  { key: 'attachments' as const, label: tr('附件', 'Attachments'), color: 'var(--chart-2)' },
  { key: 'shell' as const, label: tr('命令输出', 'Command output'), color: 'var(--chart-3)' },
]);

// Opening and the same single-session actions available in the session list.
const previewItem = ref<DataItem>();
const sessionActions = computed<MenuItem[]>(() => [
  { key: 'preview', icon: 'eye', label: tr('预览会话', 'Preview session') },
  { key: 'rename', icon: 'pencil', label: i18n.t('manage.rename') },
  { key: 'tags', icon: 'tag', label: i18n.t('sessions.editTags') },
  { key: 'export', icon: 'download', label: tr('导出会话', 'Export session'), separator: true },
  { key: 'prune', icon: 'eraser', label: tr('清理历史', 'Clear history') },
  { key: 'archive', icon: 'archive', label: tr('归档会话…', 'Archive session…'), separator: true },
  { key: 'delete', icon: 'trash-2', label: i18n.t('sessions.delete'), danger: true },
]);
const action = ref<{ target: ActionTarget; kind: 'rename' | 'tags' | 'delete' }>();
function act(item: DataItem, key: string) {
  if (key === 'preview') previewItem.value = item;
  else if (key === 'export' || key === 'archive') sessionPackageActions[key]([item]);
  else if (key === 'prune') clearing.value = { targets: [{ id: item.id, name: sessionTitle(item) }] };
  else
    action.value = {
      target: item,
      kind: key as 'rename' | 'tags' | 'delete',
    };
}
function actionClosed() {
  action.value = undefined;
  void refresh();
}

const anchor = ref<string>();
const chosen = ref(new Set<string>());
watch(
  () => snapshot.value?.items,
  (items) => {
    if (!items) return;
    const present = new Set(items.map((item) => item.id));
    const retained = new Set([...chosen.value].filter((id) => present.has(id)));
    if (retained.size !== chosen.value.size) chosen.value = retained;
  },
);
function clearChosen() {
  chosen.value = new Set();
  anchor.value = undefined;
}
function archived(ids: string[]) {
  const remaining = new Set(chosen.value);
  for (const id of ids) remaining.delete(id);
  chosen.value = remaining;
  anchor.value = undefined;
}
function toggle(item: DataItem, shift: boolean) {
  const next = new Set(chosen.value);
  const start = shift ? shown.value.findIndex((row) => row.id === anchor.value) : -1;
  const end = shown.value.indexOf(item);
  const range = start < 0 ? [item] : shown.value.slice(Math.min(start, end), Math.max(start, end) + 1);
  const select = !next.has(item.id);
  for (const row of range) {
    if (select) next.add(row.id);
    else next.delete(row.id);
  }
  anchor.value = item.id;
  chosen.value = next;
}
watch(query, clearChosen);
watch(order, () => {
  anchor.value = undefined;
});
const chosenItems = computed(() => (snapshot.value?.items ?? []).filter((item) => chosen.value.has(item.id)));
const chosenSessions = computed(() => chosenItems.value.filter((item) => item.kind === 'session'));
const chosenBytes = computed(() => chosenItems.value.reduce((sum, item) => sum + item.bytes.total, 0));
const chosenReclaim = computed(() =>
  estimate.data.value?.sessions.reduce((sum, row) => sum + (chosen.value.has(row.id) ? row.bytes.total : 0), 0),
);
const skipped = computed(
  () => estimate.data.value?.skipped.filter((row) => !chosen.value.size || chosen.value.has(row.id)).length ?? 0,
);
const cleanupSummary = computed(() => {
  const result = estimate.data.value;
  if (!result)
    return estimate.error.value
      ? tr('查看清理范围并重新估算', 'Review scope and retry estimate')
      : tr('正在估算可释放空间…', 'Estimating reclaimable space…');
  if (result.bytes.total) return tr('预计可释放 ', 'Estimated recovery: ') + fmtBytes(result.bytes.total);
  if (result.stale_entries || result.files)
    return tr('可清理失效记录或空文件', 'Stale records or empty files can be cleared');
  return tr('已检查的会话没有可清理的历史', 'No reclaimable history in checked sessions');
});
const pageSelected = computed(() => pageItems.value.filter((row) => chosen.value.has(row.id)).length);
function togglePage() {
  const next = new Set(chosen.value);
  for (const row of pageItems.value) {
    if (pageSelected.value === pageItems.value.length) next.delete(row.id);
    else next.add(row.id);
  }
  chosen.value = next;
  anchor.value = undefined;
}
// Clearing old history: every session (null), one, or the sessions chosen.
const clearing = ref<{ targets: { id: string; name: string }[] | null }>();
function clearHistoryOfChosen() {
  clearing.value = { targets: chosenSessions.value.map((item) => ({ id: item.id, name: sessionTitle(item) })) };
}
function cleared() {
  clearing.value = undefined;
  clearChosen();
  void refresh();
}

const confirming = ref(false);
function deleted() {
  confirming.value = false;
  clearChosen();
  void refresh();
}
</script>

<template>
  <OverlayWindow :title="i18n.t('stats.storage')" max-width="1040px" gutter="clamp(16px, 2.5vw, 28px)">
    <template #tools><RefreshStamp :at="snapshot?.at" :loading="loading" @refresh="refreshAll" /></template>
    <div class="data-body">
      <p v-if="failed" class="load-error" role="alert">
        {{ failed }}<span v-if="snapshot">{{ tr('下方是上次读取的数据。', 'The last reading remains below.') }}</span>
      </p>
      <Spinner v-if="loading && !snapshot" />
      <template v-if="snapshot">
        <section class="data-summary">
          <div class="data-total">
            <div>
              <small>{{
                snapshot.storage ? tr('磁盘占用', 'Disk usage') : tr('会话内容合计', 'Session content total')
              }}</small>
              <Hint :text="(storageShown?.bytes.total ?? snapshot.bytes.total).toLocaleString() + ' B'"
                ><strong>{{ fmtBytes(storageShown?.bytes.total ?? snapshot.bytes.total) }}</strong></Hint
              >
              <span
                >{{
                  tr(
                    snapshot.sessions + ' 个会话',
                    snapshot.sessions + (snapshot.sessions === 1 ? ' session' : ' sessions'),
                  )
                }}<template v-if="runningCount">
                  · {{ tr(runningCount + ' 个运行中', runningCount + ' running') }}</template
                ></span
              >
            </div>
          </div>
          <StorageCard
            v-if="storageShown"
            :storage="storageShown"
            :selected-bytes="view === 'sessions' && chosen.size ? chosenReclaim : undefined"
            :order="view === 'sessions' ? order : undefined"
            :archives-open="view === 'archives'"
            @archives="view = 'archives'"
            @sort="
              view = 'sessions';
              order = $event;
            "
          />
          <div class="cleanup-box" v-if="snapshot.sessions">
            <h3>{{ tr('安全清理', 'Safe cleanup') }}</h3>
            <button type="button" class="data-clear" @click="clearing = { targets: null }">
              <span
                >{{ tr('过期历史与未引用文件', 'Unused history and files') }}<small>{{ cleanupSummary }}</small></span
              ><Icon name="chevron-right" />
            </button>
            <small v-if="skipped">{{
              tr('已跳过 ' + skipped + ' 个忙碌会话', skipped + ' busy sessions skipped')
            }}</small>
          </div>
          <UsageRecords v-if="snapshot.storage" :storage="snapshot.storage" @changed="refresh" />
        </section>
        <section class="data-ranking" :aria-label="tr('会话占用排行', 'Sessions by storage use')">
          <SelectField v-model="view" :options="views" segmented="always" />
          <ArchivesList v-if="view === 'archives'" :revision="archiveRevision" @removing="archiveRemoving" />
          <template v-else>
            <div class="data-toolbar">
              <label class="data-search"
                ><Icon name="search" /><input
                  v-model="query"
                  type="search"
                  :placeholder="tr('搜索名称、ID 或标签', 'Search names, IDs or tags')"
                  :aria-label="tr('搜索会话', 'Search sessions')"
              /></label>
              <Menu :items="orders" :label="tr('排序', 'Order')" @select="(key) => (order = key)">
                <template #trigger
                  ><button type="button" class="btn data-order" :aria-label="`${tr('排序', 'Order')}: ${orderLabel}`">
                    <Icon name="chevrons-up-down" />{{ orderLabel }}
                  </button></template
                >
              </Menu>
            </div>

            <p v-if="!shown.length" class="data-empty">
              {{
                snapshot.items.length
                  ? tr('没有符合的会话。', 'Nothing matches.')
                  : tr('还没有会话。', 'No sessions yet.')
              }}
            </p>
            <nav v-if="pageCount > 1" class="data-pagination" :aria-label="tr('分页', 'Pagination')">
              <button class="btn sm" :disabled="page === 0" @click="page--">{{ tr('上一页', 'Previous') }}</button>
              <span>{{ page + 1 }} / {{ pageCount }}</span>
              <button class="btn sm" :disabled="page + 1 >= pageCount" @click="page++">
                {{ tr('下一页', 'Next') }}
              </button>
            </nav>
            <div v-if="pageItems.length" class="data-list">
              <DataCheckbox
                class="page-select"
                :label="tr('选择本页', 'Select page')"
                :checked="pageSelected === pageItems.length"
                :mixed="pageSelected > 0 && pageSelected < pageItems.length"
                @toggle="togglePage"
                >{{ tr('选择本页', 'Select page') }} ·
                {{ tr(pageItems.length + ' 个会话', pageItems.length + ' sessions') }}</DataCheckbox
              >
              <DataRow
                v-for="item in pageItems"
                :key="item.id"
                :item="item"
                :max-bytes="pageMaxBytes"
                :parts="parts"
                :actions="sessionActions"
                :chosen="chosen.has(item.id)"
                @toggle="(shift) => toggle(item, shift)"
                @act="(key) => act(item, key)"
              />
            </div>
          </template>
        </section>
      </template>
    </div>
    <!-- Room under the last cards for the bar that floats over the window while anything is chosen. -->
    <div
      v-if="view === 'sessions' && chosen.size"
      class="data-bar-room"
      :style="{ '--selection-bar-height': `${selectionHeight}px` }"
      aria-hidden="true"
    />
    <!-- Floats over the bottom of the window while anything is chosen. -->
    <template #overlay>
      <Transition name="data-float">
        <div
          v-if="view === 'sessions' && chosen.size"
          ref="selectionBar"
          class="data-selection"
          role="toolbar"
          :aria-label="tr('已选的会话', 'Chosen sessions')"
        >
          <button
            type="button"
            class="btn ghost icon-only"
            :aria-label="tr('取消选择', 'Clear selection')"
            :data-hint="tr('取消选择', 'Clear selection')"
            @click="clearChosen"
          >
            <Icon name="x" />
          </button>
          <span>{{
            tr(`已选 ${chosen.size} 个，共 ${fmtBytes(chosenBytes)}`, `${chosen.size} chosen, ${fmtBytes(chosenBytes)}`)
          }}</span>
          <button
            v-if="shown.length > pageSize && chosen.size < shown.length"
            class="btn ghost"
            @click="chosen = new Set(shown.map((row) => row.id))"
          >
            {{ tr('选择全部 ' + shown.length + ' 个匹配项', 'Select all ' + shown.length + ' matches') }}
          </button>
          <button type="button" class="btn" :disabled="!chosenSessions.length" @click="exportSessions(chosenSessions)">
            <Icon name="download" />{{ tr('导出', 'Export') }}
          </button>
          <button type="button" class="btn data-clear" :disabled="!chosenSessions.length" @click="clearHistoryOfChosen">
            <Icon name="eraser" />{{ tr('清理历史', 'Clear history') }}
          </button>
          <button class="btn" @click="confirmArchive(chosenItems, archived)">
            <Icon name="archive" />{{ tr('归档', 'Archive') }}
          </button>
          <button type="button" class="btn danger solid" @click="confirming = true">
            <Icon name="trash-2" />{{ tr('删除', 'Delete') }}
          </button>
        </div>
      </Transition>
    </template>
  </OverlayWindow>

  <PruneDialog
    v-if="clearing"
    :targets="clearing.targets"
    :total="snapshot?.sessions ?? 0"
    @close="clearing = undefined"
    @pruned="cleared"
  />
  <SessionListAction
    v-if="action"
    :key="`${action.target.id}:${action.kind}`"
    :target="action.target"
    :kind="action.kind"
    @close="actionClosed"
  />
  <StorageSessionPreview
    v-if="previewItem"
    :item="previewItem"
    @close="previewItem = undefined"
    @open="
      router.push('/s/' + previewItem.id);
      previewItem = undefined;
    "
  />
  <DeleteSessionsDialog
    v-if="confirming"
    :targets="chosenItems.map((item) => ({ ...item, name: sessionTitle(item) }))"
    :bytes="chosenBytes"
    @close="confirming = false"
    @deleted="deleted"
    @archive="
      confirmArchive(chosenItems, archived);
      confirming = false;
    "
  />
</template>

<style scoped>
.data-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 12px 0;
}
.data-body {
  display: grid;
  gap: 16px;
  max-width: 1100px;
  margin-inline: auto;
}

.data-ranking {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 12px;
}
@media (min-width: 900px) {
  .data-body {
    grid-template-columns: minmax(250px, 300px) minmax(0, 1fr);
    align-items: start;
  }
  .data-body > p {
    grid-column: 1 / -1;
  }
  .data-summary {
    position: sticky;
    top: 0;
    max-height: calc(min(820px, 90dvh) - 68px);
    overflow-y: auto;
  }
}
.cleanup-box {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
.cleanup-box h3 {
  font-size: 13px;
  margin: 0 0 6px;
}
.cleanup-box small {
  display: block;
  font-size: 12px;
  color: var(--fg-subtle);
}
.cleanup-box .data-clear {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 0;
  font: inherit;
  font-size: 13px;
  background: none;
  border: 0;
  cursor: pointer;
  text-align: start;
  color: var(--fg);
}
.cleanup-box .data-clear:hover {
  color: var(--accent);
}
.data-summary,
.data-list {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-raised);
}
.data-summary {
  padding: 14px 16px;
  display: grid;
  gap: 12px;
}
.data-total > div {
  display: flex;
  align-items: center;
  align-items: start;
  flex-direction: column;
  gap: 4px;
}
.data-total {
  justify-content: space-between;
}
.data-total small {
  flex-basis: 100%;
  color: var(--fg-muted);
}
.data-total strong {
  font: 600 30px/1.15 var(--font);
  font-variant-numeric: tabular-nums;
}
.data-total span,
.page-select {
  font-size: 12px;
  color: var(--fg-subtle);
}
.data-clear .icon {
  width: 15px;
  height: 15px;
}
.page-select {
  display: flex;
  padding: 8px;
}
@media (max-width: 599px) {
  .page-select {
    --check-column: 24px;
  }
}
.data-list {
  overflow: hidden;
}
.data-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.data-search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg-subtle);
}
.data-search:focus-within {
  border-color: var(--accent);
}
.data-search .icon {
  width: 16px;
  height: 16px;
}
.data-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--fg);
  font: inherit;
}
.data-order {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
}
.data-order .icon {
  width: 15px;
  height: 15px;
  color: var(--fg-subtle);
}
/* What is chosen and what can be done with it: floats over the bottom of the window, centred, and
   the page leaves room under the last cards so none stays hidden behind it. */
.data-selection {
  position: absolute;
  z-index: 3;
  left: 50%;
  bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: calc(100% - 32px);
  padding: 8px 8px 8px 6px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: var(--bg-raised);
  box-shadow: var(--shadow-pop);
  color: var(--fg-muted);
  font-size: 13px;
  translate: -50% 0;
}
.data-selection span {
  min-width: 0;
  margin-right: 16px;
  font-variant-numeric: tabular-nums;
}
.data-selection .btn.danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.data-selection .icon {
  width: 16px;
  height: 16px;
}
.data-bar-room {
  height: calc(var(--selection-bar-height, 44px) + 20px);
}
.data-float-enter-active {
  transition:
    opacity 180ms var(--ease-out),
    transform 180ms var(--ease-out);
}
.data-float-leave-active {
  transition:
    opacity 140ms ease-in,
    transform 140ms ease-in;
}
.data-float-enter-from,
.data-float-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
.data-empty {
  margin: 24px 0;
  color: var(--fg-subtle);
  text-align: center;
}

@media (max-width: 899px) {
  .data-list,
  .data-summary {
    background: var(--bg-group);
    border-radius: 16px;
  }
  .data-toolbar {
    flex-wrap: wrap;
  }
  .data-search {
    height: 40px;
    border-radius: 12px;
    background: var(--bg-group);
    border-color: transparent;
  }
  .data-order {
    margin-right: auto;
  }
  .data-selection {
    flex-wrap: wrap;
    bottom: calc(12px + env(safe-area-inset-bottom));
    width: calc(100% - 24px);
    max-width: none;
    border-radius: 18px;
  }
  .data-selection span {
    flex-basis: calc(100% - 48px);
    margin-right: 0;
  }
  .data-selection .btn:not(.icon-only) {
    flex: 1;
    justify-content: center;
  }
  .data-bar-room {
    height: calc(var(--selection-bar-height, 96px) + 12px + env(safe-area-inset-bottom));
  }
}
</style>
