<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
// Session list with client query (server filter), tag chip, virtualized
// rows (TanStack) and endless next-page loading — data unbounded, DOM bounded.
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { cfg } from '../../core/config.ts';
import { sessions, sessionTitle } from '../../core/state/sessionsSlice.ts';
import { i18n } from '../../core/i18n/index.ts';
import SessionListRow, { type RowAction } from './SessionListRow.vue';
import SessionListAction from './SessionListAction.vue';
import DeleteSessionsDialog from './DeleteSessionsDialog.vue';
import PruneDialog from './PruneDialog.vue';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import Wordmark from '../../ui/components/Wordmark.vue';
import AppMenu from '../shell/AppMenu.vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import { goHome } from './useRecentsSheet.ts';
import { tr } from '../../core/i18n/tr.ts';


const route = useRoute();
const router = useRouter();
// On a desktop the list is the app's sidebar, with its brand, a new-session row and the app menu;
// on a phone it is a page of its own under the start page's header.
const isMobile = useIsMobile();
const query = ref(sessions.query.value);
const composing = ref(false);
const listEl = ref<HTMLElement | null>(null);

const action = ref<{ target: { id: string; name?: string }; kind: 'rename' | 'tags' | 'delete' } | null>(null);
const rows = computed(() => sessions.items.value);

// Choosing several, from a row's menu: rows become boxes to tick, and a bar at the bottom acts on
// the ticked ones. Only rows the list shows count, so a search never hides one that would go.
const selecting = ref(false);
const chosen = ref(new Set<string>());
const chosenRows = computed(() => rows.value.filter(row => chosen.value.has(row.id)));
const allChosen = computed(() => rows.value.length > 0 && rows.value.every(row => chosen.value.has(row.id)));
function toggle(id: string) {
  const next = new Set(chosen.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  chosen.value = next;
}
function chooseAll() {
  chosen.value = allChosen.value ? new Set() : new Set(rows.value.map(row => row.id));
}
function stopSelecting() {
  selecting.value = false;
  chosen.value = new Set();
}
// Clearing history or deleting: one row from its menu, or the chosen ones from the bar.
const batch = ref<{ kind: 'prune' | 'delete'; targets: { id: string; name: string }[] } | null>(null);
function actOnChosen(kind: 'prune' | 'delete') {
  batch.value = { kind, targets: chosenRows.value.map(row => ({ id: row.id, name: sessionTitle(row) })) };
}
function batchDone() {
  const ended = !!batch.value && selecting.value;
  batch.value = null;
  if (ended) stopSelecting();
}
function onRowAction(row: { id: string; name?: string }, kind: RowAction) {
  if (kind === 'select') { selecting.value = true; chosen.value = new Set([row.id]); }
  else if (kind === 'prune') batch.value = { kind, targets: [{ id: row.id, name: sessionTitle(row) }] };
  else action.value = { target: { id: row.id, name: row.name }, kind };
}
const rearranging = ref(false);
let motionTimer: ReturnType<typeof setTimeout>;
// Rearrange motion triggers on an id-set change; building the full joined
// string on every row patch is wasted work — length plus the boundary ids
// is a cheap enough fingerprint for a purely cosmetic class toggle.
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

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => listEl.value,
    estimateSize: () => cfg.design.sessionRowHeight + cfg.design.sessionRowGap,
    overscan: 8,
    getItemKey: (i: number) => rows.value[i]?.id ?? `i${i}`,
  })),
);

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
      <Hint v-if="isMobile" :text="i18n.t('sessions.new')"><button class="btn icon-only sl-add" :aria-label="i18n.t('sessions.new')"
        @click="router.push('/new')"><Icon name="new-session" class="sl-add-glyph" /></button></Hint>
    </div>
    <button v-if="!isMobile" type="button" class="sl-new" @click="router.push('/new')"><span class="sl-new-icon"><Icon name="new-session" class="sl-new-glyph" /></span>{{ i18n.t('sessions.new') }}</button>
    <div v-if="sessions.tagFilter.value" class="sl-filters" role="group" :aria-label="i18n.t('sessions.filter.group')">
      <span class="tag-chip">
        {{ sessions.tagFilter.value }}
        <button :aria-label="i18n.t('common.remove')" @click="sessions.setTagFilter('')"><Icon name="x" class="sm" /></button>
      </span>
    </div>
    <div ref="listEl" class="sl-scroll" :class="{ scrolling, scrolled }" data-scroll-preserve :aria-busy="sessions.loading.value" @scroll.passive="onListScroll">
      <div v-if="sessions.loading.value && !rows.length" class="sl-state"><Spinner /></div>
      <div v-else-if="sessions.error.value" class="sl-state load-error" role="alert">
        <span>{{ String(sessions.error.value?.detail || sessions.error.value?.message || sessions.error.value) }}</span>
        <button class="btn ghost sm" @click="() => sessions.refresh()">{{ i18n.t('common.retry') }}</button>
      </div>
      <div v-else-if="!rows.length" class="sl-state hint">{{ i18n.t('sessions.empty') }}</div>
      <TransitionGroup tag="div" name="session-filter" :css="rearranging" :class="{ rearranging }" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <div v-for="v in virtualizer.getVirtualItems()" :key="rows[v.index]?.id"
          :ref="(el) => el && virtualizer.measureElement(el as HTMLElement)" :data-index="v.index"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', paddingBottom: `${cfg.design.sessionRowGap}px`, transform: `translateY(${v.start}px)` }">
          <SessionListRow :row="rows[v.index]" :index="v.index" :active="rows[v.index]?.id === activeId"
            selectable :selecting="selecting" :chosen="chosen.has(rows[v.index]!.id)"
            @action="kind => onRowAction(rows[v.index]!, kind)" @toggle="toggle(rows[v.index]!.id)" />
        </div>
      </TransitionGroup>
    </div>
    <div v-if="selecting" class="sl-select-bar" role="toolbar" :aria-label="tr('已选的会话', 'Chosen sessions')">
      <div class="sl-select-head">
        <Hint :text="tr('退出多选', 'Stop selecting')"><button type="button" class="btn ghost icon-only" :aria-label="tr('退出多选', 'Stop selecting')" @click="stopSelecting"><Icon name="x" /></button></Hint>
        <span>{{ tr(`已选 ${chosenRows.length} 个`, `${chosenRows.length} chosen`) }}</span>
        <button type="button" class="btn ghost" :disabled="!rows.length" @click="chooseAll">{{ allChosen ? tr('取消全选', 'Clear all') : tr('全选', 'Choose all') }}</button>
      </div>
      <div class="sl-select-actions">
        <button type="button" class="btn" :disabled="!chosenRows.length" @click="actOnChosen('prune')"><Icon name="eraser" />{{ tr('清理历史', 'Clear history') }}</button>
        <button type="button" class="btn danger solid" :disabled="!chosenRows.length" @click="actOnChosen('delete')"><Icon name="trash-2" />{{ tr('删除', 'Delete') }}</button>
      </div>
    </div>
    <footer v-else-if="!isMobile" class="sl-foot"><AppMenu placement="sidebar" /></footer>
    <SessionListAction v-if="action" :key="`${action.target.id}:${action.kind}`" :target="action.target" :kind="action.kind" @close="action = null" />
    <PruneDialog v-if="batch?.kind === 'prune'" :targets="batch.targets" :total="rows.length" @close="batch = null" @pruned="batchDone" />
    <DeleteSessionsDialog v-if="batch?.kind === 'delete'" :targets="batch.targets" @close="batch = null" @deleted="batchDone" />
  </div>
</template>

<style scoped>
.rearranging { transition: height 240ms cubic-bezier(.2,.7,.2,1); }
.rearranging > div { transition: transform 240ms cubic-bezier(.2,.7,.2,1); }
.session-filter-enter-active, .session-filter-leave-active { transition: scale 240ms cubic-bezier(.2,.7,.2,1), opacity 240ms ease !important; transform-origin: top; }
.session-filter-enter-from, .session-filter-leave-to { scale: 1 0; opacity: 0; }
.session-filter-leave-active { pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .rearranging, .rearranging > div, .session-filter-enter-active, .session-filter-leave-active { transition: none !important; }
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
.sl-select-bar { display: grid; flex: none; gap: 6px; padding: 6px 8px 10px; border-top: 1px solid var(--line); animation: sl-rise 160ms var(--ease-out); }
.sl-select-head { display: flex; align-items: center; gap: 4px; color: var(--fg-muted); font-size: 13px; }
.sl-select-head span { flex: 1; min-width: 0; font-variant-numeric: tabular-nums; }
.sl-select-head .btn.icon-only .icon { width: 16px; height: 16px; }
.sl-select-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sl-select-actions .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.sl-select-actions .icon { width: 16px; height: 16px; }
.sl-select-actions .btn:not(.danger) .icon { color: var(--fg-subtle); }
@keyframes sl-rise { from { opacity: 0; translate: 0 8px; } }
@media (max-width: 899px) {
  .sl-select-bar { width: 100%; max-width: var(--mobile-content-width); margin-inline: auto; padding: 8px 16px 12px; }
}
</style>
