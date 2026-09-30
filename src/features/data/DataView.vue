<script setup lang="ts">
// Every session and what it keeps: a window over the app on a desktop, a page of its own on a phone.
// Sessions are cards in a grid, each with what it stores - its history, attachments and command
// output. Clicking a card chooses it; the chosen ones are cleared of old history or deleted
// together, and each card's menu opens, renames, tags, clears or deletes that one.
import { computed, onActivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../../ui/components/Icon.vue';
import Menu, { type MenuItem } from '../../ui/components/Menu.vue';
import RefreshStamp from '../../ui/components/RefreshStamp.vue';
import Spinner from '../../ui/components/Spinner.vue';
import SessionListAction from '../sessions/SessionListAction.vue';
import PruneDialog from '../sessions/PruneDialog.vue';
import OverlayWindow from '../../ui/components/OverlayWindow.vue';
import DataSessionCard from './DataSessionCard.vue';
import DeleteSessionsDialog from '../sessions/DeleteSessionsDialog.vue';
import * as api from '../../core/api/endpoints.ts';
import type { SessionStorage, SessionBytes } from '../../core/api/endpoints.ts';
import { createCachedResource } from '../../core/util/cachedResource.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';

const router = useRouter();

type Snapshot = { sessions: SessionStorage[]; bytes: SessionBytes; directory: number | null; at: number };
// The last reading shows at once; a fresh one replaces it.
const reading = createCachedResource(async (_: void, signal): Promise<Snapshot> => {
  const [found, directory] = await Promise.all([api.sessionsStorage({ signal }), api.storageStatus({ signal }).catch(() => null)]);
  return { ...found, directory: directory?.bytes.total ?? null, at: Date.now() };
}, () => ({ key: 'data-sessions', persist: true }));
const snapshot = computed(() => reading.data.value ?? undefined);
const loading = reading.loading;
const failed = reading.error;
// A reading already on its way is not started over.
function refresh() {
  if (!loading.value) void reading.load();
}
onActivated(refresh);

// Finding and ordering.
const query = ref('');
const order = ref('updated');
const orders = computed<MenuItem[]>(() => [
  { key: 'updated', icon: 'clock', label: tr('最近更新', 'Recently updated') },
  { key: 'size', icon: 'storage', label: tr('占用最大', 'Largest') },
  { key: 'created', icon: 'plus', label: tr('最新创建', 'Newest') },
].map(item => ({ ...item, checked: item.key === order.value })));
const orderLabel = computed(() => orders.value.find(item => item.checked)?.label ?? '');
const shown = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const list = (snapshot.value?.sessions ?? []).filter(item => {
    const text = `${item.name} ${item.id} ${(item.tags ?? []).join(' ')}`.toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  const by: Record<string, (a: SessionStorage, b: SessionStorage) => number> = {
    updated: (a, b) => b.updated_at - a.updated_at,
    size: (a, b) => b.bytes.total - a.bytes.total,
    created: (a, b) => b.created_at - a.created_at,
  };
  return [...list].sort(by[order.value] ?? by.updated);
});

// What a session's bytes are made of, in the order the bars show them.
const parts = computed(() => [
  { key: 'history' as const, label: tr('对话记录', 'History'), color: 'var(--chart-1)' },
  { key: 'attachments' as const, label: tr('附件', 'Attachments'), color: 'var(--chart-2)' },
  { key: 'shell' as const, label: tr('命令输出', 'Command output'), color: 'var(--chart-3)' },
]);

// Opening, and the single-session actions the session list has too.
function open(item: SessionStorage) {
  void router.push(`/s/${item.id}`);
}
const actions = computed<MenuItem[]>(() => [
  { key: 'open', icon: 'external-link', label: tr('打开', 'Open') },
  { key: 'rename', icon: 'pencil', label: i18n.t('manage.rename') },
  { key: 'tags', icon: 'tag', label: i18n.t('sessions.editTags') },
  { key: 'prune', icon: 'eraser', label: tr('清理历史', 'Clear history') },
  { key: 'delete', icon: 'trash-2', label: i18n.t('sessions.delete'), danger: true, separator: true },
]);
const action = ref<{ target: { id: string; name?: string }; kind: 'rename' | 'tags' | 'delete' }>();
function act(item: SessionStorage, key: string) {
  if (key === 'open') open(item);
  else if (key === 'prune') clearing.value = { targets: [{ id: item.id, name: sessionTitle(item) }] };
  else action.value = { target: { id: item.id, name: item.name }, kind: key as 'rename' | 'tags' | 'delete' };
}
function actionClosed() {
  action.value = undefined;
  void refresh();
}

// Choosing: a click on a card adds it or takes it out; what is chosen is acted on together.
const chosen = ref(new Set<string>());
function clearChosen() {
  chosen.value = new Set();
}
function toggle(item: SessionStorage) {
  const next = new Set(chosen.value);
  if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
  chosen.value = next;
}
const chosenItems = computed(() => (snapshot.value?.sessions ?? []).filter(item => chosen.value.has(item.id)));
const chosenBytes = computed(() => chosenItems.value.reduce((sum, item) => sum + item.bytes.total, 0));
const allShownChosen = computed(() => shown.value.length > 0 && shown.value.every(item => chosen.value.has(item.id)));
function chooseAllShown() {
  chosen.value = allShownChosen.value ? new Set() : new Set(shown.value.map(item => item.id));
}
// Clearing old history: every session (null), one, or those chosen.
const clearing = ref<{ targets: { id: string; name: string }[] | null }>();
function clearHistoryOfChosen() {
  clearing.value = { targets: chosenItems.value.map(item => ({ id: item.id, name: sessionTitle(item) })) };
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
  <OverlayWindow :title="tr('会话与数据', 'Sessions & data')" gutter="clamp(24px, 4vw, 40px)">
    <template #tools><RefreshStamp :at="snapshot?.at" :loading="loading" @refresh="refresh" /></template>
      <div class="data-body">
        <p v-if="failed" class="load-error" role="alert">{{ failed }}<span v-if="snapshot">{{ tr('下方是上次读取的数据。', 'The last reading remains below.') }}</span></p>
        <Spinner v-if="loading && !snapshot" />
        <template v-if="snapshot">
          <section class="data-summary">
            <div class="data-total">
              <strong>{{ fmtBytes(snapshot.bytes.total) }}</strong>
              <span>{{ tr(`${snapshot.sessions.length} 个会话`, `${snapshot.sessions.length} session${snapshot.sessions.length === 1 ? '' : 's'}`) }}<template v-if="snapshot.directory != null"> · {{ tr(`数据目录共 ${fmtBytes(snapshot.directory)}`, `${fmtBytes(snapshot.directory)} in the data directory`) }}</template></span>
              <button type="button" class="btn data-clear" :disabled="!snapshot.sessions.length" @click="clearing = { targets: null }"><Icon name="eraser" />{{ tr('清理历史', 'Clear history') }}</button>
            </div>
            <div class="data-bar" role="img" :aria-label="parts.map(part => `${part.label} ${fmtBytes(snapshot!.bytes[part.key])}`).join(', ')">
              <template v-for="part in parts" :key="part.key"><span v-if="snapshot.bytes[part.key] > 0" :style="{ flexGrow: snapshot.bytes[part.key], background: part.color }" /></template>
            </div>
            <ul class="data-legend">
              <li v-for="part in parts" :key="part.key"><i :style="{ background: part.color }" />{{ part.label }}<strong>{{ fmtBytes(snapshot.bytes[part.key]) }}</strong></li>
            </ul>
          </section>

          <div class="data-toolbar">
            <label class="data-search"><Icon name="search" /><input v-model="query" type="search" :placeholder="tr('搜索名称或标签', 'Search names or tags')" :aria-label="tr('搜索会话', 'Search sessions')" /></label>
            <Menu :items="orders" :label="tr('排序', 'Order')" @select="key => order = key">
              <template #trigger><button type="button" class="btn data-order" :aria-label="`${tr('排序', 'Order')}: ${orderLabel}`"><Icon name="chevrons-up-down" />{{ orderLabel }}</button></template>
            </Menu>
          </div>

          <p v-if="!shown.length" class="data-empty">{{ snapshot.sessions.length ? tr('没有符合的会话。', 'No sessions match.') : tr('还没有会话。', 'No sessions yet.') }}</p>
          <div class="data-grid">
            <DataSessionCard v-for="item in shown" :key="item.id" :item="item" :parts="parts" :actions="actions" :chosen="chosen.has(item.id)" @toggle="toggle(item)" @act="key => act(item, key)" />
          </div>
        </template>
      </div>
      <!-- Room under the last cards for the bar that floats over the window while anything is chosen. -->
      <div v-if="chosen.size" class="data-bar-room" aria-hidden="true" />
    <!-- Floats over the bottom of the window while anything is chosen. -->
    <template #overlay>
    <Transition name="data-float">
      <div v-if="chosen.size" class="data-selection" role="toolbar" :aria-label="tr('已选的会话', 'Chosen sessions')">
        <button type="button" class="btn ghost icon-only" :aria-label="tr('取消选择', 'Clear selection')" :data-hint="tr('取消选择', 'Clear selection')" @click="clearChosen"><Icon name="x" /></button>
        <span>{{ tr(`已选 ${chosen.size} 个，共 ${fmtBytes(chosenBytes)}`, `${chosen.size} chosen, ${fmtBytes(chosenBytes)}`) }}</span>
        <button type="button" class="btn ghost" :disabled="!shown.length" @click="chooseAllShown">{{ allShownChosen ? tr('取消全选', 'Clear all') : tr('全选', 'Choose all') }}</button>
        <button type="button" class="btn data-clear" @click="clearHistoryOfChosen"><Icon name="eraser" />{{ tr('清理历史', 'Clear history') }}</button>
        <button type="button" class="btn danger solid" @click="confirming = true"><Icon name="trash-2" />{{ tr('删除', 'Delete') }}</button>
      </div>
    </Transition>
    </template>
  </OverlayWindow>

  <PruneDialog v-if="clearing" :targets="clearing.targets" :total="snapshot?.sessions.length ?? 0" @close="clearing = undefined" @pruned="cleared" />
  <SessionListAction v-if="action" :key="`${action.target.id}:${action.kind}`" :target="action.target" :kind="action.kind" @close="actionClosed" />
  <DeleteSessionsDialog v-if="confirming" :targets="chosenItems.map(item => ({ id: item.id, name: sessionTitle(item) }))" :bytes="chosenBytes" @close="confirming = false" @deleted="deleted" />
</template>

<style scoped>
.data-body { display: grid; gap: 16px; max-width: 1100px; margin-inline: auto; }

.data-summary { display: grid; gap: 10px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); }
.data-total { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; }
.data-total strong { font-size: 24px; font-weight: 600; line-height: 1.2; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.data-total span { flex: 1; min-width: 0; color: var(--fg-subtle); font-size: 12.5px; }
.data-clear { display: inline-flex; flex: none; align-items: center; gap: 6px; }
.data-clear .icon { width: 16px; height: 16px; color: var(--fg-subtle); }
.data-total .data-clear { align-self: center; }
.data-bar { display: flex; gap: 2px; height: 10px; overflow: hidden; border-radius: 999px; background: var(--bg-sunken); }
.data-bar span { flex: 0 1 0; min-width: 4px; }
.data-legend { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0; padding: 0; list-style: none; color: var(--fg-muted); font-size: 12.5px; }
.data-legend li { display: flex; align-items: center; gap: 6px; }
.data-legend i { width: 8px; height: 8px; border-radius: 2px; }
.data-legend strong { margin-left: 2px; color: var(--fg); font-weight: 500; font-variant-numeric: tabular-nums; }

.data-toolbar { display: flex; align-items: center; gap: 8px; }
.data-search { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; height: 36px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--bg); color: var(--fg-subtle); }
.data-search:focus-within { border-color: var(--accent); }
.data-search .icon { width: 16px; height: 16px; }
.data-search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font: inherit; }
.data-order { display: inline-flex; flex: none; align-items: center; gap: 6px; }
.data-order .icon { width: 15px; height: 15px; color: var(--fg-subtle); }
/* What is chosen and what can be done with it: floats over the bottom of the window, centred, and
   the page leaves room under the last cards so none stays hidden behind it. */
.data-selection { position: absolute; z-index: 3; left: 50%; bottom: 20px; display: flex; align-items: center; gap: 8px; width: max-content; max-width: calc(100% - 32px); padding: 8px 8px 8px 6px; border: 1px solid var(--line-strong); border-radius: 14px; background: var(--bg-raised); box-shadow: var(--shadow-pop); color: var(--fg-muted); font-size: 13px; translate: -50% 0; }
.data-selection span { min-width: 0; margin-right: 16px; font-variant-numeric: tabular-nums; }
.data-selection .btn.danger { display: inline-flex; align-items: center; gap: 6px; }
.data-selection .icon { width: 16px; height: 16px; }
.data-bar-room { height: 64px; }
.data-float-enter-active { transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out); }
.data-float-leave-active { transition: opacity 140ms ease-in, transform 140ms ease-in; }
.data-float-enter-from, .data-float-leave-to { opacity: 0; transform: translateY(12px); }
.data-empty { margin: 24px 0; color: var(--fg-subtle); text-align: center; }

.data-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }

@media (max-width: 899px) {
  .data-summary { border: 0; border-radius: 18px; background: var(--bg-group); }
  /* The total and its button share the first line; the counts get a line of their own. */
  .data-total .data-clear { order: 1; margin-left: auto; }
  .data-total span { order: 2; flex-basis: 100%; }
  .data-toolbar { flex-wrap: wrap; }
  .data-search { flex-basis: 100%; height: 40px; border-radius: 12px; background: var(--bg-group); border-color: transparent; }
  .data-order { margin-right: auto; }
  .data-selection { flex-wrap: wrap; bottom: calc(12px + env(safe-area-inset-bottom)); width: calc(100% - 24px); max-width: none; border-radius: 18px; }
  .data-selection span { flex-basis: calc(100% - 48px); margin-right: 0; }
  .data-selection .btn:not(.icon-only) { flex: 1; justify-content: center; }
  .data-bar-room { height: calc(108px + env(safe-area-inset-bottom)); }
  .data-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
}
</style>
