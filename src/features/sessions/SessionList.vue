<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
// Session list with client query (server filter), tag chip, virtualized
// rows (TanStack) and endless next-page loading — data unbounded, DOM bounded.
// It shows one folder at a time: opening a folder replaces the rows with what it holds, and the
// path above them leads back up; what is made here - sessions, groups, folders - goes in it.
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { cfg } from '../../core/config.ts';
import { sessions, sessionTitle, type FolderRow, type GroupRow, type ListRow, type SessionRow } from '../../core/state/sessionsSlice.ts';
import { i18n } from '../../core/i18n/index.ts';
import SessionListRow, { type RowAction } from './SessionListRow.vue';
import SessionListAction, { type ActionTarget } from './SessionListAction.vue';
import FolderListRow, { type FolderAction } from './FolderListRow.vue';
import MoveDialog from './MoveDialog.vue';
import NewFolderDialog from './NewFolderDialog.vue';
import { errorDetail } from '../../core/errors.ts';
import { toast } from '../../ui/toast.ts';
import { useListDrag } from './useListDrag.ts';
import { useMedia } from '../../ui/composables/useMedia.ts';
import DeleteSessionsDialog from './DeleteSessionsDialog.vue';
import PruneDialog from './PruneDialog.vue';
import CreateGroupDialog from '../groups/CreateGroupDialog.vue';
import Icon from '../../ui/components/Icon.vue';
import Menu, { type MenuItem } from '../../ui/components/Menu.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import Wordmark from '../../ui/components/Wordmark.vue';
import AppMenu from '../shell/AppMenu.vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import { goHome } from './useRecentsSheet.ts';
import { tr } from '../../core/i18n/tr.ts';
import { platform } from '../../platform/index.ts';


const route = useRoute();
const router = useRouter();
// On a desktop the list is the app's sidebar, with its brand, a new-session row and the app menu;
// on a phone it is a page of its own under the start page's header.
const isMobile = useIsMobile();
const query = ref(sessions.query.value);
const composing = ref(false);
const listEl = ref<HTMLElement | null>(null);

const action = ref<{ target: ActionTarget; kind: 'rename' | 'tags' | 'delete' } | null>(null);
const rows = computed(() => sessions.items.value);

// Choosing several, from a row's menu: rows become boxes to tick, and a bar at the bottom acts on
// the ticked ones - deleting sessions and groups alike, clearing the history of the sessions among
// them. Only rows the list shows count, so a search never hides one that would go.
const selecting = ref(false);
const chosen = ref(new Set<string>());
// Sessions and groups are chosen, as far as they show; folders are opened.
const entries = computed(() => lines.value.flatMap(line => line.kind === 'row' && line.row.kind !== 'folder' ? [line.row] : []));
const sessionRows = computed(() => entries.value.filter(row => row.kind === 'session'));
const chosenRows = computed(() => entries.value.filter(row => chosen.value.has(row.id)));
const chosenSessions = computed(() => chosenRows.value.filter(row => row.kind === 'session'));
const allChosen = computed(() => entries.value.length > 0 && entries.value.every(row => chosen.value.has(row.id)));
const chosenLabel = computed(() => {
  const sessions = chosenSessions.value.length, groups = chosenRows.value.length - sessions;
  const parts = [
    sessions ? tr(`${sessions} 个会话`, `${sessions} session${sessions === 1 ? '' : 's'}`) : '',
    groups ? tr(`${groups} 个群组`, `${groups} group${groups === 1 ? '' : 's'}`) : '',
  ].filter(Boolean);
  return parts.length ? tr(`已选 ${parts.join('、')}`, `${parts.join(', ')} chosen`) : tr('已选 0 个', 'None chosen');
});
function toggle(id: string) {
  const next = new Set(chosen.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  chosen.value = next;
}
function chooseAll() {
  chosen.value = allChosen.value ? new Set() : new Set(entries.value.map(row => row.id));
}
function stopSelecting() {
  selecting.value = false;
  chosen.value = new Set();
}
// Clearing history or deleting: one row from its menu, or the chosen ones from the bar.
const batch = ref<{ kind: 'prune' | 'delete'; targets: { id: string; name: string; group?: boolean }[] } | null>(null);
function actOnChosen(kind: 'prune' | 'delete') {
  const targets = kind === 'prune' ? chosenSessions.value : chosenRows.value;
  batch.value = { kind, targets: targets.map(row => ({ id: row.id, name: sessionTitle(row), group: row.kind === 'group' })) };
}
function batchDone() {
  const ended = !!batch.value && selecting.value;
  batch.value = null;
  if (ended) stopSelecting();
}
function onRowAction(row: SessionRow | GroupRow, kind: RowAction) {
  if (kind === 'select') { selecting.value = true; chosen.value = new Set([row.id]); }
  else if (kind === 'prune') batch.value = { kind, targets: [{ id: row.id, name: sessionTitle(row) }] };
  else if (kind === 'pin' || kind === 'unpin') pin([row.id], kind === 'pin');
  else if (kind === 'move') moving.value = { ids: [row.id], title: tr(`移动「${sessionTitle(row)}」`, `Move “${sessionTitle(row)}”`), from: row.parent };
  else action.value = { target: { id: row.id, name: row.name, kind: row.kind }, kind };
}
function onFolderAction(row: FolderRow, kind: FolderAction) {
  if (kind === 'pin' || kind === 'unpin') pin([row.id], kind === 'pin');
  else if (kind === 'move') moving.value = { ids: [row.id], title: tr(`移动文件夹「${row.name}」`, `Move folder “${row.name}”`), from: row.parent };
  else action.value = { target: { id: row.id, name: row.name, kind: 'folder' }, kind };
}
function pin(ids: string[], pinned: boolean) {
  sessions.pin(ids, pinned).catch(error => toast(errorDetail(error)));
}
// Moving: one row from its menu, or the chosen ones from the bar.
const moving = ref<{ ids: string[]; title: string; from: string | null } | null>(null);
function moveChosen() {
  moving.value = { ids: chosenRows.value.map(row => row.id), title: tr(`移动 ${chosenRows.value.length} 项`, `Move ${chosenRows.value.length} items`), from: sessions.filtered.value ? null : sessions.folder.value };
}
function moved() {
  const ended = selecting.value;
  moving.value = null;
  if (ended) stopSelecting();
}
// The folder shown, the one above it, and making things in it.
const here = computed(() => sessions.filtered.value ? null : sessions.folder.value);
const upward = computed(() => sessions.path.value.at(-2)?.id ?? null);
function newSession() {
  void router.push(here.value ? { path: '/new', query: { folder: here.value } } : '/new');
}
const creatingGroup = ref(false);
const creatingFolder = ref(false);
// What the plus beside the search makes: a group or a folder - and on a phone, where no row
// offers it, a session too.
const makeItems = computed<MenuItem[]>(() => [
  ...(isMobile.value ? [{ key: 'session', icon: 'new-session', label: i18n.t('sessions.new') }] : []),
  { key: 'group', icon: 'users', label: i18n.t('sessions.newGroup') },
  { key: 'folder', icon: 'folder-plus', label: tr('新建文件夹', 'New folder') },
]);
function make(key: string) {
  if (key === 'session') newSession();
  else if (key === 'group') creatingGroup.value = true;
  else creatingFolder.value = true;
}

// Dragging rows onto folders: the browser's drag and drop with a mouse, a held press with a finger.
const canDrag = useMedia('(hover: hover) and (pointer: fine)');
const drag = useListDrag((ids, into) => {
  const ended = selecting.value;
  sessions.move(ids, into).then(() => { if (ended) stopSelecting(); }, error => toast(errorDetail(error)));
}, folder => sessions.open(folder));
// What dragging a row takes: a chosen row takes every chosen one with it.
function dragged(row: SessionRow | GroupRow | FolderRow) {
  const ids = selecting.value && chosen.value.has(row.id) ? [...chosen.value] : [row.id];
  const parents = new Set(rows.value.filter(item => ids.includes(item.id)).map(item => item.parent));
  const label = ids.length > 1 ? tr(`${ids.length} 项`, `${ids.length} items`) : row.kind === 'folder' ? row.name : sessionTitle(row);
  return { ids, from: parents.size === 1 ? [...parents][0] : undefined, label };
}
function startDrag(row: SessionRow | GroupRow | FolderRow, event: DragEvent) {
  const { ids, from } = dragged(row);
  const link = row.kind === 'folder' ? undefined : new URL(router.resolve(`/${row.kind === 'group' ? 'g' : 's'}/${row.id}`).href, location.href).href;
  drag.start(event, ids, from, link);
}
function pressRow(row: SessionRow | GroupRow | FolderRow, event: TouchEvent) {
  const { ids, from, label } = dragged(row);
  drag.press(event, ids, from, label);
}
// The open folder's own room takes a drop that no folder row took.
function hoverHere(event: DragEvent) {
  if (!event.defaultPrevented && !sessions.filtered.value) drag.hover(event, here.value);
}
function dropHere(event: DragEvent) {
  if (!event.defaultPrevented && !sessions.filtered.value) drag.drop(event, here.value);
}
const rearranging = ref(false);
let motionTimer: ReturnType<typeof setTimeout>;
// Rearrange motion triggers on an id-set change; building the full joined
// string on every row patch is wasted work — length plus the boundary ids
// is a cheap enough fingerprint for a purely cosmetic class toggle.
// The list as shown: its rows under headings - the folders, what is pinned, then the rest by the
// day it last changed: today, yesterday, each day of the week before, and older. The listing's own
// order already runs that way (search results by time alone), so a heading goes wherever the
// section changes. A heading folds its section away, and the list remembers which are folded.
type Line = { kind: 'heading'; key: string; label: string; section: string; folded: boolean } | { kind: 'row'; key: string; row: ListRow };
const FOLDED_KEY = 'list.folded-sections';
const folded = ref(new Set<string>(readFolded()));
function readFolded(): string[] {
  try { const stored = JSON.parse(platform('storage').get(FOLDED_KEY) ?? '[]'); return Array.isArray(stored) ? stored : []; } catch { return []; }
}
function fold(section: string) {
  const next = new Set(folded.value);
  if (next.has(section)) next.delete(section); else next.add(section);
  folded.value = next;
  try { platform('storage').set(FOLDED_KEY, JSON.stringify([...next])); } catch { /* the sections open unfolded next time */ }
}
const DAY = 86_400_000;
const lines = computed<Line[]>(() => {
  const today = new Date().setHours(0, 0, 0, 0);
  const day = new Intl.DateTimeFormat(i18n.locale.value, { month: 'short', day: 'numeric' });
  const out: Line[] = [];
  let current = '';
  for (const row of rows.value) {
    let id: string, label: string;
    if (row.kind === 'folder') [id, label] = ['folders', tr('文件夹', 'Folders')];
    else if (row.pinned && !sessions.filtered.value) [id, label] = ['pinned', tr('置顶', 'Pinned')];
    else {
      const ago = Math.round((today - new Date(row.updated_at).setHours(0, 0, 0, 0)) / DAY);
      [id, label] = ago <= 0 ? ['today', tr('今天', 'Today')] : ago === 1 ? ['yesterday', tr('昨天', 'Yesterday')]
        : ago < 7 ? [`day-${ago}`, day.format(row.updated_at)] : ['older', tr('更早', 'Older')];
    }
    if (id !== current) out.push({ kind: 'heading', key: `heading:${id}`, label, section: id, folded: folded.value.has(id) });
    current = id;
    if (!folded.value.has(id)) out.push({ kind: 'row', key: row.id, row });
  }
  return out;
});
const rowFingerprint = () => `${rows.value.length}|${rows.value[0]?.id ?? ''}|${rows.value[rows.value.length - 1]?.id ?? ''}`;
watch(rowFingerprint, () => {
  rearranging.value = true;
  clearTimeout(motionTimer);
  motionTimer = setTimeout(() => { rearranging.value = false; }, 280);
});
onBeforeUnmount(() => { clearTimeout(motionTimer); clearTimeout(scrollbarTimer); });
const activeId = computed(() => route.params.id);

// The state slice owns the search debounce; a second UI timer doubles latency.
watch(query, (q) => { if (!composing.value) sessions.setQuery(q); });

const HEADING_HEIGHT = 44;
const virtualizer = useVirtualizer(
  computed(() => ({
    count: lines.value.length,
    getScrollElement: () => listEl.value,
    estimateSize: (i: number) => lines.value[i]?.kind === 'heading' ? HEADING_HEIGHT : cfg.design.sessionRowHeight + cfg.design.sessionRowGap,
    overscan: 8,
    getItemKey: (i: number) => lines.value[i]?.key ?? `i${i}`,
  })),
);
const shown = computed(() => virtualizer.value.getVirtualItems().map(v => ({ v, line: lines.value[v.index]! })));

// Endless pagination, driven by real scroll position (the rendered-index
// watch alone stalls: once the last VIRTUAL index stops changing, nothing
// re-fires while the user keeps pinning to the bottom).
// The scrollbar hides at rest: every scroll shows it again, and it fades once
// the list has been still for a moment (the CSS owns the fade itself).
const scrolling = ref(false);
// Rows scrolled under the heading fade out instead of being cut; at the top nothing is under it.
const scrolled = ref(false);
let scrollbarTimer: ReturnType<typeof setTimeout>;
function showScrollbar() {
  scrolling.value = true;
  clearTimeout(scrollbarTimer);
  scrollbarTimer = setTimeout(() => { scrolling.value = false; }, 600);
}
function onListScroll() {
  const el = listEl.value;
  if (!el) return;
  showScrollbar();
  scrolled.value = el.scrollTop > 0;
  const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (fromBottom < 400 && sessions.hasMore.value && !sessions.loadingMore.value) sessions.loadMore();
}

onMounted(() => { if (!rows.value.length && !sessions.loading.value) sessions.loadFirst(); });
</script>

<template>
  <div class="sessions-pane">
    <header v-if="!isMobile" class="sl-brand">
      <Hint :text="i18n.t('sessions.collapseList')"><button type="button" class="btn ghost icon-only sl-collapse" :aria-label="i18n.t('sessions.collapseList')"
        aria-controls="session-list" aria-expanded="true" @click="prefs.setSessionListCollapsed(true)"><Icon name="panel-left" /></button></Hint>
      <img class="sl-brand-mark" src="/app-icons/mark.svg" alt="" /><Wordmark class="sl-brand-word" />
    </header>
    <header v-if="isMobile" class="page-bar"><button type="button" class="btn ghost icon-only" :aria-label="i18n.t('chatbar.back')" @click="goHome(router)"><Icon name="arrow-left" /></button><h1 class="page-bar-title">{{ tr('全部会话', 'All sessions') }}</h1></header>
    <div class="sl-masthead">
      <div class="sl-head">
        <Spinner v-if="sessions.loading.value" /><Icon v-else name="search" />
        <input v-model="query" type="search" @compositionstart="composing = true"
          @compositionend="composing = false; sessions.setQuery(query)" :placeholder="i18n.t('sessions.search')" :aria-label="i18n.t('sessions.search')" />
      </div>
      <Menu :items="makeItems" :label="tr('新建', 'New')" @select="make">
        <template #trigger><button type="button" class="btn icon-only sl-add" :aria-label="tr('新建', 'New')"><Icon name="plus" class="sl-add-glyph" /></button></template>
      </Menu>
    </div>
    <button v-if="!isMobile" type="button" class="sl-new" @click="newSession"><span class="sl-new-icon"><Icon name="new-session" class="sl-new-glyph" /></span>{{ i18n.t('sessions.new') }}</button>
    <CreateGroupDialog v-if="creatingGroup" :folder="here" @close="creatingGroup = false" />
    <NewFolderDialog v-if="creatingFolder" :parent="here" @close="creatingFolder = false" />
    <nav v-if="here" class="sl-path" :aria-label="tr('当前位置', 'Where you are')">
      <Hint :text="tr('返回上一级', 'Up one level')"><button type="button" class="btn ghost icon-only sl-up" :aria-label="tr('返回上一级', 'Up one level')" @click="sessions.open(upward)"><Icon name="arrow-left" /></button></Hint>
      <ol>
        <li><button type="button" class="sl-path-root" :class="{ 'sl-drop': drag.over.value === null }" data-drop-place="/" :aria-label="tr('根目录', 'Top level')" @click="sessions.open(null)"
          @dragenter="drag.hover($event, null)" @dragover="drag.hover($event, null)" @dragleave="drag.leave($event, null)" @drop="drag.drop($event, null)">/</button></li>
        <li v-for="(folder, index) in sessions.path.value" :key="folder.id">
          <span v-if="index" class="sl-path-sep" aria-hidden="true">/</span>
          <button type="button" :class="{ 'sl-drop': drag.over.value === folder.id }" :data-drop-place="folder.id" :aria-current="index === sessions.path.value.length - 1 ? 'location' : undefined" @click="sessions.open(folder.id)"
            @dragenter="drag.hover($event, folder.id)" @dragover="drag.hover($event, folder.id)" @dragleave="drag.leave($event, folder.id)" @drop="drag.drop($event, folder.id)">{{ folder.name }}</button>
        </li>
      </ol>
    </nav>
    <div v-if="sessions.tagFilter.value" class="sl-filters" role="group" :aria-label="i18n.t('sessions.filter.group')">
      <span class="tag-chip">
        {{ sessions.tagFilter.value }}
        <button :aria-label="i18n.t('common.remove')" @click="sessions.setTagFilter('')"><Icon name="x" class="sm" /></button>
      </span>
    </div>
    <div ref="listEl" class="sl-scroll" :class="{ scrolling, scrolled, docked: selecting, 'sl-drop-here': drag.dragging.value && drag.over.value === here }" data-scroll-preserve :aria-busy="sessions.loading.value" @scroll.passive="onListScroll"
      :data-drop-place="sessions.filtered.value ? undefined : here ?? '/'"
      @dragenter="hoverHere" @dragover="hoverHere" @dragleave="drag.leave($event, here)" @drop="dropHere">
      <div v-if="sessions.loading.value && !rows.length" class="sl-state"><Spinner /></div>
      <div v-else-if="sessions.error.value" class="sl-state load-error" role="alert">
        <span>{{ String(sessions.error.value?.detail || sessions.error.value?.message || sessions.error.value) }}</span>
        <button class="btn ghost sm" @click="() => sessions.refresh()">{{ i18n.t('common.retry') }}</button>
      </div>
      <div v-else-if="!rows.length" class="sl-state hint">{{ here ? tr('这个文件夹是空的', 'This folder is empty') : i18n.t('sessions.empty') }}</div>
      <div :class="{ rearranging }" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <template v-for="{ v, line } in shown" :key="line.key">
        <div v-if="line.kind === 'heading'" :ref="(el) => el && virtualizer.measureElement(el as HTMLElement)" :data-index="v.index"
          class="sl-heading" :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }">
          <button type="button" :aria-expanded="!line.folded" @click="fold(line.section)">{{ line.label }}<Icon name="chevron-down" /></button>
        </div>
        <div v-else :ref="(el) => el && virtualizer.measureElement(el as HTMLElement)" :data-index="v.index"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', paddingBottom: `${cfg.design.sessionRowGap}px`, transform: `translateY(${v.start}px)` }"
          :draggable="canDrag" :class="{ 'sl-drop': drag.over.value === line.row.id, 'sl-dragged': drag.dragging.value?.ids.includes(line.row.id) }"
          :data-drop-place="line.row.kind === 'folder' ? line.row.id : undefined" :data-drop-opens="line.row.kind === 'folder' ? '' : undefined"
          @touchstart.passive="pressRow(line.row, $event)"
          @dragstart="startDrag(line.row, $event)"
          @dragenter="line.row.kind === 'folder' && drag.hover($event, line.row.id, true)"
          @dragover="line.row.kind === 'folder' && drag.hover($event, line.row.id)"
          @dragleave="line.row.kind === 'folder' && drag.leave($event, line.row.id)"
          @drop="line.row.kind === 'folder' && drag.drop($event, line.row.id)">
          <FolderListRow v-if="line.row.kind === 'folder'" :row="line.row" :selecting="selecting"
            @open="sessions.open(line.row.id)" @action="kind => onFolderAction(line.row as FolderRow, kind)" />
          <SessionListRow v-else :row="line.row" :index="v.index" :active="line.row.id === activeId"
            arranged :pin-mark="sessions.filtered.value" selectable :selecting="selecting" :chosen="chosen.has(line.row.id)"
            @action="kind => onRowAction(line.row as SessionRow | GroupRow, kind)" @toggle="toggle(line.row.id)" />
        </div>
        </template>
      </div>
    </div>
    <Transition name="sl-dock">
    <div v-if="selecting" class="sl-select-bar" role="toolbar" :aria-label="tr('已选的会话和群组', 'Chosen sessions and groups')">
      <div class="sl-select-head">
        <Hint :text="tr('退出多选', 'Stop selecting')"><button type="button" class="btn ghost icon-only" :aria-label="tr('退出多选', 'Stop selecting')" @click="stopSelecting"><Icon name="x" /></button></Hint>
        <span class="sl-chosen"><span class="sl-chosen-full">{{ chosenLabel }}</span><span class="sl-chosen-short">{{ tr(`已选 ${chosenRows.length} 个`, `${chosenRows.length} chosen`) }}</span></span>
        <button type="button" class="btn ghost" :disabled="!entries.length" @click="chooseAll">{{ allChosen ? tr('取消全选', 'Clear all') : tr('全选', 'Choose all') }}</button>
      </div>
      <div class="sl-select-actions">
        <Hint :text="tr('移动到…', 'Move to…')"><button type="button" class="btn" :aria-label="tr('移动到…', 'Move to…')" :disabled="!chosenRows.length" @click="moveChosen"><Icon name="folder" /><span class="sl-action-label">{{ tr('移动到…', 'Move to…') }}</span></button></Hint>
        <Hint :text="tr('清理历史', 'Clear history')"><button type="button" class="btn" :aria-label="tr('清理历史', 'Clear history')" :disabled="!chosenSessions.length" @click="actOnChosen('prune')"><Icon name="eraser" /><span class="sl-action-label">{{ tr('清理历史', 'Clear history') }}</span></button></Hint>
        <Hint :text="tr('删除', 'Delete')"><button type="button" class="btn danger solid" :aria-label="tr('删除', 'Delete')" :disabled="!chosenRows.length" @click="actOnChosen('delete')"><Icon name="trash-2" /><span class="sl-action-label">{{ tr('删除', 'Delete') }}</span></button></Hint>
      </div>
    </div>
    </Transition>
    <footer v-if="!selecting && !isMobile" class="sl-foot"><AppMenu placement="sidebar" /></footer>
    <SessionListAction v-if="action" :key="`${action.target.id}:${action.kind}`" :target="action.target" :kind="action.kind" @close="action = null" />
    <PruneDialog v-if="batch?.kind === 'prune'" :targets="batch.targets" :total="sessionRows.length" @close="batch = null" @pruned="batchDone" />
    <DeleteSessionsDialog v-if="batch?.kind === 'delete'" :targets="batch.targets" @close="batch = null" @deleted="batchDone" />
    <div v-if="drag.ghost.value" class="sl-touch-ghost" :style="{ transform: `translate(${drag.ghost.value.x}px, ${drag.ghost.value.y}px)` }" aria-hidden="true">
      <Icon name="folder" />{{ drag.ghost.value.label }}
    </div>
    <MoveDialog v-if="moving" :ids="moving.ids" :title="moving.title" :from="moving.from" @close="moving = null" @moved="moved" />
  </div>
</template>

<style scoped>
/* When rows come and go, a row leaving is simply gone, and the rows after it slide up into its
   place: each row's place is its transform, which only moves smoothly just after the rows change,
   never as the list measures itself. */
.rearranging { transition: height 220ms cubic-bezier(.2,.7,.2,1); }
.rearranging > div { transition: transform 220ms cubic-bezier(.2,.7,.2,1); }
@media (prefers-reduced-motion: reduce) {
  .rearranging, .rearranging > div { transition: none !important; }
}
.sl-brand { display: flex; flex: none; align-items: center; gap: 8px; padding: 10px 12px 2px 8px; }
.sl-brand .sl-collapse { color: var(--fg-subtle); }
.sl-brand .sl-collapse .icon { width: 18px; height: 18px; }
.sl-brand-mark { display: block; width: 22px; height: auto; }
.sl-brand-word { height: 14px; color: var(--fg); }
.sl-new { display: flex; flex: none; align-items: center; gap: 10px; margin: 2px 8px 8px; padding: 6px 8px; border: 0; border-radius: var(--radius); background: transparent; color: var(--fg); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; transition: background var(--dur-fast); }
@media (hover: hover) { .sl-new:hover { background: var(--bg-hover); } }
.sl-new-icon { display: grid; place-items: center; width: 24px; height: 24px; color: var(--fg-muted); }
.sl-new-glyph { display: block; width: 22px; height: 22px; }
.sl-foot { flex: none; padding: 6px 8px 8px; border-top: 1px solid var(--line); }
/* Choosing several: in place of the app menu, what is chosen and what can be done with it. */
/* Choosing several: a dock floating over the foot of the list, which scrolls its last rows clear
   of it. The phone's page gives the pane's parts its own color; the dock keeps the raised one. */
.shell .sessions-pane > .sl-select-bar { position: absolute; z-index: 4; left: 0; right: 0; bottom: 10px; display: grid; gap: 6px; width: calc(100% - 16px); margin-inline: auto; padding: 6px 8px 8px; border: 1px solid var(--line-strong); border-radius: 14px; background: var(--bg-raised); box-shadow: var(--shadow-pop); }
.shell .sessions-pane > .sl-select-bar { container-type: inline-size; }
.sl-scroll.docked { padding-bottom: 120px; }
/* A narrow dock says only how many are chosen, and its buttons show their icons alone. */
.sl-chosen-short { display: none; }
@container (max-width: 340px) { .sl-chosen-full { display: none; } .sl-chosen-short { display: inline; } }
@container (max-width: 300px) { .sl-action-label { display: none; } }
.sl-dock-enter-active, .sl-dock-leave-active { transition: opacity 180ms var(--ease-out), translate 180ms var(--ease-out); }
.sl-dock-enter-from, .sl-dock-leave-to { opacity: 0; translate: 0 14px; }
.sl-select-head { display: flex; align-items: center; gap: 4px; color: var(--fg-muted); font-size: 13px; }
.sl-select-head span { flex: 1; min-width: 0; font-variant-numeric: tabular-nums; }
.sl-select-head .btn.icon-only .icon { width: 16px; height: 16px; }
.sl-select-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.sl-select-actions .btn { padding-inline: 6px; white-space: nowrap; }
/* Where the list is: up one level, then its path as a file's is written, `/` the top, each step
   leading there. */
.sl-path { display: flex; align-items: center; flex: none; gap: 4px; min-width: 0; min-height: 44px; padding: 2px 8px 6px; }
.sl-path .sl-up { width: 34px; height: 34px; min-height: 34px; color: var(--fg-subtle); }
.sl-path .sl-up .icon { width: 16px; height: 16px; }
.sl-path ol { display: flex; align-items: center; flex: 1; min-width: 0; margin: 0; padding: 0; overflow: hidden; list-style: none; font-size: 13.5px; }
.sl-path li { display: flex; align-items: center; min-width: 0; flex: 0 1 auto; }
.sl-path li:last-child { flex-shrink: 0; max-width: 60%; }
.sl-path-sep { flex: none; color: var(--fg-subtle); opacity: .6; }
/* A heading over a section of the list: small and quiet, in line with the rows' text, and set well
   apart from the section above, as the rows within a section sit close. */
.sl-heading { padding: 22px 8px 6px; }
.sl-heading button { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px; border: 0; border-radius: 5px; background: none; color: var(--fg-subtle); font: inherit; font-size: 12px; font-weight: 500; line-height: 16px; cursor: pointer; }
@media (hover: hover) { .sl-heading button:hover { color: var(--fg); } }
.sl-heading .icon { width: 13px; height: 13px; transition: transform var(--dur-fast) var(--ease-out); }
.sl-heading [aria-expanded='false'] .icon { transform: rotate(-90deg); }
.sl-heading[data-index='0'] { padding-top: 4px; }
/* Dragging: what is dragged fades, and the place a drop would go lights up. */
.sl-dragged { opacity: .45; }
.sl-drop :deep(.sl-item), .sl-path li button.sl-drop { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent); color: var(--fg); }
.sl-scroll.sl-drop-here { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); border-radius: var(--radius); }
/* What a finger drags rides above it, out of its way. */
.sl-touch-ghost { position: fixed; z-index: 80; top: 0; left: 0; display: flex; align-items: center; gap: 6px; max-width: 70vw; margin: -56px 0 0 -24px; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--bg-overlay); box-shadow: var(--shadow-pop); color: var(--fg); font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.sl-touch-ghost .icon { flex: none; width: 15px; height: 15px; color: var(--fg-subtle); }
:global(.sl-drag-badge) { position: fixed; top: -100px; left: -100px; display: grid; place-items: center; min-width: 28px; height: 28px; padding: 0 8px; border-radius: 14px; background: var(--accent); color: var(--accent-fg); font: 600 13px/1 var(--font); }
.sl-path li button.sl-path-root { padding-inline: 6px; font-weight: 600; }
.sl-path li button { min-width: 0; padding: 6px 7px; border: 0; border-radius: 5px; background: none; color: var(--fg-subtle); font: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.sl-path li button[aria-current] { color: var(--fg); font-weight: 500; cursor: default; }
@media (hover: hover) { .sl-path li button:not([aria-current]):hover { background: var(--bg-hover); color: var(--fg); } }
.sl-select-actions .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.sl-select-actions .icon { width: 16px; height: 16px; }
.sl-select-actions .btn:not(.danger) .icon { color: var(--fg-subtle); }
@media (max-width: 899px) {
  .shell .sessions-pane > .sl-select-bar { width: calc(100% - 24px); max-width: var(--mobile-content-width); padding: 8px 10px 10px; border-radius: 18px; }
}
@media (prefers-reduced-motion: reduce) { .sl-dock-enter-active, .sl-dock-leave-active { transition: none; } }
</style>
