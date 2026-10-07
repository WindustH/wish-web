<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { conversationsList } from '../../core/api/endpoints.ts';
import { bus } from '../../core/bus.ts';
import { i18n } from '../../core/i18n/index.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { createCachedResource } from '../../core/util/cachedResource.ts';
import SessionListRow, { type RowAction } from './SessionListRow.vue';
import SessionListAction, { type ActionTarget } from './SessionListAction.vue';
import PruneDialog from './PruneDialog.vue';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import { sessionTitle, type GroupRow, type ListRow, type SessionRow } from '../../core/state/sessionsSlice.ts';
const active = usePageActivity();
// The home page comes and goes with every trip to a conversation or a setting; it shows the last
// list - sessions and groups - at once, even after a reload, and swaps in the fresh one when it arrives.
const recent = createCachedResource((_: void, signal) => conversationsList({ limit: 5, order: 'desc', flat: true }, { signal }).then(page => (page.items as ListRow[]).filter((row): row is SessionRow | GroupRow => row.kind !== 'folder')),
  () => ({ key: 'recent-sessions', persist: true }));
const rows = computed(() => recent.data.value ?? []);
const action = ref<{ target: ActionTarget; kind: 'rename' | 'tags' | 'delete' }>();
const clearing = ref<{ id: string; name: string }>();
function onRowAction(row: ListRow, kind: RowAction) {
  if (kind === 'prune') clearing.value = { id: row.id, name: sessionTitle(row) };
  else if (kind === 'rename' || kind === 'tags' || kind === 'delete') action.value = { target: { id: row.id, name: row.name, kind: row.kind }, kind };
}
let timer: ReturnType<typeof setTimeout> | undefined;
function refresh() {
  clearTimeout(timer);
  if (active.value) timer = setTimeout(() => recent.load(), 200);
}
const off = ['upsert.session', 'tombstone.session', 'upsert.group', 'tombstone.group', 'list.changed', 'sync.snapshot'].map(topic => bus.on(topic, refresh));
watch(active, value => {
  if (value) void recent.load();
  else { recent.cancel(); clearTimeout(timer); action.value = undefined; clearing.value = undefined; }
}, { immediate: true });
onScopeDispose(() => { recent.cancel(); clearTimeout(timer); off.forEach(stop => stop()); });
</script>

<template>
  <section class="recent-sessions" :aria-label="tr('最近会话', 'Recent sessions')">
    <header class="recent-head">
      <h2>{{ tr('最近会话', 'Recent sessions') }}</h2>
      <RouterLink to="/sessions/all" class="recent-all">{{ tr('查看全部', 'View all') }}<Icon name="chevron-right" /></RouterLink>
    </header>
    <p v-if="recent.error.value" class="load-error" role="alert">{{ recent.error.value }} <button class="btn ghost sm" @click="recent.load()">{{ i18n.t('common.retry') }}</button></p>
    <p v-else-if="recent.loading.value && !rows.length" class="hint">{{ tr('正在读取会话…', 'Loading sessions…') }}</p>
    <p v-else-if="!rows.length" class="hint">{{ i18n.t('sessions.empty') }}</p>
    <SessionListRow v-for="(row, index) in rows" :key="row.id" :row="row" :index="index" :active="false"
      @action="kind => onRowAction(row, kind)" />
    <SessionListAction v-if="action" :key="`${action.target.id}:${action.kind}`" :target="action.target" :kind="action.kind" @close="action = undefined; refresh()" />
    <PruneDialog v-if="clearing" :targets="[clearing]" :total="rows.length" @close="clearing = undefined" @pruned="clearing = undefined" />
  </section>
</template>

<style scoped>
.recent-sessions { margin-top: 28px; }
/* The heading and the rows' dots share one edge with the text in the composer above. */
.recent-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 0 4px 0 12px; }
.recent-head h2 { flex: 1; min-width: 0; margin: 0; color: var(--fg); font: 600 16px/1.5 var(--font); }
.recent-all { display: inline-flex; align-items: center; gap: 2px; min-height: 36px; padding: 0 6px 0 8px; border-radius: var(--radius); color: var(--fg-subtle); font-size: 13px; text-decoration: none; }
.recent-all:active { background: var(--bg-hover); }
.recent-all .icon { width: 15px; height: 15px; }
.recent-sessions > .hint, .recent-sessions > .load-error { padding-inline: 12px; }
/* The same gap the full list puts between rows, so the rows carry straight over when it opens. */
.recent-sessions :deep(.sl-item + .sl-item) { margin-top: 4px; }
</style>
