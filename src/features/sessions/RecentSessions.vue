<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue';
import { sessionsList } from '../../core/api/endpoints.ts';
import { bus } from '../../core/bus.ts';
import { errorText } from '../../core/config-editor.ts';
import { i18n } from '../../core/i18n/index.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { peekCached, readCached, writeCached } from '../../core/util/responseCache.ts';
import SessionListRow from './SessionListRow.vue';
import SessionListAction from './SessionListAction.vue';
import Icon from '../../ui/components/Icon.vue';
const active = usePageActivity();
// The home page comes and goes with every trip to a conversation or a setting; it shows the last
// list at once, even after a reload, and swaps in the fresh one when it arrives.
const CACHE_KEY = 'recent-sessions';
const rows = ref<any[]>(peekCached<any[]>(CACHE_KEY) ?? []);
let fresh = false;
if (!rows.value.length) void readCached<any[]>(CACHE_KEY).then(saved => { if (saved && !fresh) rows.value = saved; });
const loading = ref(false);
const error = ref<unknown>();
const action = ref<{ target: { id: string; name?: string }; kind: 'rename' | 'tags' | 'delete' }>();
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = undefined;
  try {
    const page = await sessionsList({ limit: 5, order: 'desc' });
    if (current === generation) {
      fresh = true;
      rows.value = page.items;
      writeCached(CACHE_KEY, page.items);
    }
  } catch (cause) {
    if (current === generation) error.value = cause;
  } finally {
    if (current === generation) loading.value = false;
  }
}
function refresh() {
  clearTimeout(timer);
  if (active.value) timer = setTimeout(load, 200);
}
const off = ['upsert.session', 'tombstone.session', 'sync.snapshot'].map(topic => bus.on(topic, refresh));
watch(active, value => {
  if (value) void load();
  else { generation++; clearTimeout(timer); action.value = undefined; }
}, { immediate: true });
onScopeDispose(() => { generation++; clearTimeout(timer); off.forEach(stop => stop()); });
</script>

<template>
  <section class="recent-sessions" :aria-label="i18n.locale.value === 'zh' ? '最近会话' : 'Recent sessions'">
    <header class="recent-head">
      <h2>{{ i18n.locale.value === 'zh' ? '最近会话' : 'Recent sessions' }}</h2>
      <RouterLink to="/sessions/all" class="recent-all">{{ i18n.locale.value === 'zh' ? '查看全部' : 'View all' }}<Icon name="chevron-right" /></RouterLink>
    </header>
    <p v-if="error" class="load-error" role="alert">{{ errorText(error) }} <button class="btn ghost sm" @click="load">{{ i18n.t('common.retry') }}</button></p>
    <p v-else-if="loading && !rows.length" class="hint">{{ i18n.locale.value === 'zh' ? '正在读取会话…' : 'Loading sessions…' }}</p>
    <p v-else-if="!rows.length" class="hint">{{ i18n.t('sessions.empty') }}</p>
    <SessionListRow v-for="(row, index) in rows" :key="row.id" :row="row" :index="index" :active="false"
      @action="kind => action = { target: { id: row.id, name: row.name }, kind }" />
    <SessionListAction v-if="action" :key="`${action.target.id}:${action.kind}`" :target="action.target" :kind="action.kind" @close="action = undefined; refresh()" />
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
