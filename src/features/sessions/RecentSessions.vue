<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue';
import { sessionsList } from '../../core/api/endpoints.js';
import { bus } from '../../core/bus.js';
import { errorText } from '../../core/config-editor';
import { i18n } from '../../core/i18n/index.js';
import { usePageActivity } from '../../ui/composables/usePageActivity';
import SessionListRow from './SessionListRow.vue';
import SessionListAction from './SessionListAction.vue';
import Icon from '../../ui/components/Icon.vue';
const active = usePageActivity();
const rows = ref<any[]>([]);
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
    if (current === generation) rows.value = page.items;
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
    <h2>{{ i18n.locale.value === 'zh' ? '最近会话' : 'Recent sessions' }}</h2>
    <p v-if="error" class="load-error" role="alert">{{ errorText(error) }} <button class="btn ghost sm" @click="load">{{ i18n.t('common.retry') }}</button></p>
    <p v-else-if="loading && !rows.length" class="hint">{{ i18n.locale.value === 'zh' ? '正在读取会话…' : 'Loading sessions…' }}</p>
    <p v-else-if="!rows.length" class="hint">{{ i18n.t('sessions.empty') }}</p>
    <SessionListRow v-for="(row, index) in rows" :key="row.id" :row="row" :index="index" :active="false"
      @action="kind => action = { target: { id: row.id, name: row.name }, kind }" />
    <RouterLink to="/sessions/all" class="btn ghost all-sessions">{{ i18n.locale.value === 'zh' ? '查看全部会话' : 'View all sessions' }}<Icon name="chevron-right" /></RouterLink>
    <SessionListAction v-if="action" :key="`${action.target.id}:${action.kind}`" :target="action.target" :kind="action.kind" @close="action = undefined; refresh()" />
  </section>
</template>

<style scoped>
.recent-sessions { margin-top: 28px; }
.recent-sessions h2 { margin: 0 0 10px; color: var(--fg-muted); font: 500 13px/1.5 var(--font); }
.all-sessions { display: flex; width: 100%; margin-top: 14px; gap: 8px; }
</style>
