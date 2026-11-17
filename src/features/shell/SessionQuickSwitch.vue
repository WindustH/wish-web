<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { sessionsList } from '../../core/api/endpoints.ts';
import type { SessionView } from '../../core/api/projections.ts';
import { tr } from '../../core/i18n/tr.ts';
import { quickSwitchOpen as open, sessionVisits } from './quickSwitch.ts';

const router = useRouter();
const query = ref('');
const filter = ref('all');
const rows = ref<SessionView[]>([]);
const visits = ref<Record<string, number>>({});
const loading = ref(false);
const failed = ref(false);
const active = ref(0);
const limit = ref(60);
const input = ref<HTMLInputElement>();
const results = ref<HTMLElement>();
const filters = computed(() => [
  { id: 'all', name: tr('全部', 'All') },
  { id: 'running', name: tr('运行中', 'Running') },
  { id: 'waiting', name: tr('待回复', 'Awaiting reply') },
]);
const matches = computed(() => {
  const words = query.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.value
    .filter((row) => {
      if (filter.value === 'running' && !['running', 'queued', 'compacting'].includes(row.phase)) return false;
      if (filter.value === 'waiting' && !row.pending_questions?.length) return false;
      const tags = Array.isArray(row.metadata?.tags) ? row.metadata.tags.join(' ') : '';
      const text = `${row.name} ${row.id} ${row.provider} ${row.model} ${tags}`.toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort(
      (a, b) =>
        (visits.value[b.id] ?? 0) - (visits.value[a.id] ?? 0) ||
        b.updated_at - a.updated_at ||
        a.id.localeCompare(b.id),
    );
});
const visible = computed(() => matches.value.slice(0, limit.value));
let controller: AbortController | undefined;
async function load() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  failed.value = false;
  rows.value = [];
  try {
    let cursor: number | string | null = null;
    do {
      const page = await sessionsList({ flat: true, limit: 1000, cursor, order: 'desc' }, { signal: request.signal });
      if (request.signal.aborted) return;
      const known = new Set(rows.value.map((row) => row.id));
      rows.value.push(...page.items.filter((row) => !known.has(row.id)));
      const next = page.next_cursor ?? null;
      if (next === cursor) break;
      cursor = next;
    } while (cursor != null);
  } catch {
    if (!request.signal.aborted) failed.value = true;
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
watch(open, async (value) => {
  controller?.abort();
  if (!value) return;
  query.value = '';
  filter.value = 'all';
  active.value = 0;
  limit.value = 60;
  visits.value = sessionVisits();
  void load();
  await nextTick();
  input.value?.focus();
});
watch(input, (element) => element?.focus());
watch([query, filter], () => {
  active.value = 0;
  limit.value = 60;
  results.value?.scrollTo(0, 0);
});
watch(active, async () => {
  await nextTick();
  results.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
});
onScopeDispose(() => controller?.abort());
async function choose(row?: SessionView) {
  if (!row) return;
  open.value = false;
  await router.push({ name: 'chat', params: { id: row.id } });
}
function keyboard(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    active.value = Math.max(0, Math.min(visible.value.length - 1, active.value + (event.key === 'ArrowDown' ? 1 : -1)));
  } else if (event.key === 'Enter') {
    event.preventDefault();
    void choose(visible.value[active.value]);
  }
}
</script>
<template>
  <Modal
    :open="open"
    :title="tr('快速切换会话', 'Quick switch sessions')"
    content-class="session-quick-switch"
    :layer="150"
    @close="open = false"
  >
    <div class="quick-search">
      <Icon name="search" />
      <input
        ref="input"
        v-model="query"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="quick-session-results"
        :aria-activedescendant="visible[active] ? `quick-session-${visible[active].id}` : undefined"
        :aria-label="tr('搜索会话', 'Search sessions')"
        :placeholder="tr('搜索名称、标签或模型…', 'Search names, tags or models…')"
        @keydown="keyboard"
        autocomplete="off"
      />
    </div>
    <div class="quick-filters">
      <button
        v-for="item in filters"
        :key="item.id"
        class="btn ghost"
        :aria-pressed="filter === item.id"
        @click="filter = item.id"
      >
        {{ item.name }}
      </button>
      <small>{{ tr('最近访问优先', 'Recently visited first') }}</small>
    </div>
    <div
      ref="results"
      id="quick-session-results"
      class="quick-results"
      role="listbox"
      :aria-label="tr('会话', 'Sessions')"
      :aria-busy="loading"
    >
      <button
        v-for="(row, index) in visible"
        :id="`quick-session-${row.id}`"
        :key="row.id"
        role="option"
        :aria-selected="index === active"
        tabindex="-1"
        class="quick-result"
        @pointermove="active = index"
        @mousedown.prevent
        @click="choose(row)"
      >
        <Icon name="chat" />
        <span
          ><strong>{{ row.name || row.id.slice(0, 8) }}</strong
          ><small>{{ row.provider }} · {{ row.model }}</small></span
        >
        <Icon v-if="row.running" name="loader-circle" class="spinner" />
      </button>
    </div>
    <div class="quick-status" role="status">
      <span v-if="loading">{{ tr('正在加载会话…', 'Loading sessions…') }}</span>
      <button v-else-if="failed" class="btn ghost" @click="load">
        {{ tr('加载失败，点击重试', 'Loading failed. Retry') }}
      </button>
      <span v-else-if="!matches.length">{{ tr('没有匹配的会话', 'No matching sessions') }}</span>
      <button v-if="matches.length > visible.length" class="btn ghost" @click="limit += 60">
        {{ tr('显示更多', 'Show more') }}
      </button>
      <small>{{ tr('↑ ↓ 选择 · Enter 打开 · Esc 关闭', '↑ ↓ Select · Enter Open · Esc Close') }}</small>
    </div>
  </Modal>
</template>
<style scoped>
:global(.modal-card.session-quick-switch:not(.modal-page):not(.modal-sheet)) {
  width: min(620px, calc(100vw - 24px));
}
.quick-search {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 14px;
}
.quick-search:focus-within {
  border-color: var(--accent);
}
.quick-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--fg);
  font: inherit;
  outline: none !important;
  box-shadow: none !important;
}
.quick-filters {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
  flex-wrap: wrap;
}
.quick-filters [aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
}
.quick-filters small {
  margin-left: auto;
  color: var(--fg-subtle);
}
.quick-results {
  max-height: min(48dvh, 400px);
  overflow: auto;
}
.quick-result {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--fg);
  text-align: left;
  padding: 12px;
  cursor: pointer;
}
.quick-result[aria-selected='true'] {
  background: var(--bg-hover);
}
.quick-result > span {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 5px;
}
.quick-result strong {
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.quick-result small {
  color: var(--fg-subtle);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.quick-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  color: var(--fg-subtle);
  font-size: 12px;
}
.quick-status small {
  margin-left: auto;
}
</style>
