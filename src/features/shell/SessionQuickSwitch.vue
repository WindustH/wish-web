<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { conversationsList, foldersList } from '../../core/api/endpoints.ts';
import type { Conversation, ConversationsPage, FolderView } from '../../core/api/types.ts';
type SessionRow = Extract<Conversation, { kind: 'session' }>;
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { quickSwitchOpen as open, sessionVisits } from './quickSwitch.ts';

const router = useRouter();
const query = ref('');
const rows = ref<SessionRow[]>([]);
const visits = ref<Record<string, number>>({});
const loading = ref(false);
const failed = ref(false);
const active = ref(0);
const limit = ref(60);
const input = ref<HTMLInputElement>();
const results = ref<HTMLElement>();
const folders = ref<FolderView[]>([]);
const paths = computed(() => {
  const index = new Map(folders.value.map((folder) => [folder.id, folder]));
  const result = new Map<string, string>();
  for (const folder of folders.value) {
    const names: string[] = [];
    const seen = new Set<string>();
    let item: FolderView | undefined = folder;
    while (item && !seen.has(item.id)) {
      seen.add(item.id);
      names.unshift(item.name);
      item = item.parent ? index.get(item.parent) : undefined;
    }
    result.set(folder.id, names.join(' / '));
  }
  return result;
});
function folderPath(row: SessionRow) {
  return row.parent ? (paths.value.get(row.parent) ?? '') : '';
}
const matches = computed(() => {
  const words = query.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.value
    .filter((row) => {
      const tags = Array.isArray(row.metadata?.tags) ? row.metadata.tags.join(' ') : '';
      const text = `${row.name} ${row.id} ${row.provider} ${row.model} ${tags} ${folderPath(row)}`.toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort(
      (a, b) =>
        (visits.value[b.id] ?? 0) - (visits.value[a.id] ?? 0) ||
        b.updated_at - a.updated_at ||
        a.id.localeCompare(b.id),
    );
});
function workState(row: SessionRow) {
  if (row.pending_questions?.length) return 'waiting';
  if (row.phase === 'compacting') return 'compacting';
  if (row.running || row.phase === 'running') return 'running';
  if (row.phase === 'queued') return 'queued';
  if (row.last_error) return 'error';
  return row.phase === 'suspended' ? 'suspended' : 'idle';
}
const workIcons = {
  idle: 'chat',
  running: 'loader-circle',
  compacting: 'loader-circle',
  queued: 'queue',
  waiting: 'question',
  suspended: 'pause',
  error: 'triangle-alert',
};
function workLabel(row: SessionRow) {
  const state = workState(row);
  return state === 'waiting'
    ? tr('待回复', 'Awaiting reply')
    : state === 'error'
      ? tr('回复失败', 'Reply failed')
      : i18n.t(`phase.${state}`);
}
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
    const [first, directory] = await Promise.all([
      conversationsList({ flat: true, limit: 1000, order: 'desc' }, { signal: request.signal }),
      foldersList({ signal: request.signal }),
    ]);
    if (request.signal.aborted) return;
    folders.value = directory;
    do {
      const page: ConversationsPage =
        cursor == null
          ? first
          : await conversationsList({ flat: true, limit: 1000, cursor, order: 'desc' }, { signal: request.signal });
      if (request.signal.aborted) return;
      const known = new Set(rows.value.map((row) => row.id));
      rows.value.push(...page.items.filter((row): row is SessionRow => row.kind === 'session' && !known.has(row.id)));
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
  active.value = 0;
  limit.value = 60;
  visits.value = sessionVisits();
  void load();
  await nextTick();
  input.value?.focus();
});
watch(input, (element) => element?.focus());
watch(query, () => {
  active.value = 0;
  limit.value = 60;
  results.value?.scrollTo(0, 0);
});
watch(active, async () => {
  await nextTick();
  results.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
});
onScopeDispose(() => controller?.abort());
async function choose(row?: SessionRow) {
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
    content-class="session-quick-switch launcher"
    compact
    body-scroll="content"
    :layer="150"
    @close="open = false"
  >
    <template #compact-heading>
      <div class="quick-search launcher-search">
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
          :placeholder="tr('搜索会话、文件夹或标签…', 'Search sessions, folders or tags…')"
          @keydown="keyboard"
          autocomplete="off"
        />
        <button class="quick-close launcher-close" :aria-label="tr('关闭', 'Close')" @click="open = false">
          <Icon name="x" />
        </button>
      </div>
    </template>
    <div
      ref="results"
      id="quick-session-results"
      class="quick-results launcher-results modal-scroll-region"
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
        class="quick-result launcher-row"
        @pointermove="active = index"
        @mousedown.prevent
        @click="choose(row)"
      >
        <span
          class="quick-kind"
          :class="workState(row)"
          role="img"
          :aria-label="workLabel(row)"
          :title="workLabel(row)"
        >
          <Icon
            :name="workIcons[workState(row)]"
            :class="{ spin: ['running', 'compacting'].includes(workState(row)) }"
          />
        </span>
        <strong>{{ row.name || row.id.slice(0, 8) }}</strong>
        <span v-if="folderPath(row)" class="quick-path" :title="folderPath(row)">{{ folderPath(row) }}</span>
        <span class="quick-enter launcher-key" aria-hidden="true">↵</span>
      </button>
      <div v-if="!visible.length" class="quick-empty" role="status">
        {{
          loading
            ? tr('正在加载会话…', 'Loading sessions…')
            : failed
              ? tr('无法加载会话', 'Unable to load sessions')
              : tr('没有匹配的会话', 'No matching sessions')
        }}
      </div>
      <button v-if="matches.length > visible.length" class="quick-more" @click="limit += 60">
        {{ tr('显示更多', 'Show more') }}
      </button>
    </div>
    <div class="quick-footer launcher-footer">
      <span role="status">
        <button v-if="failed" class="quick-retry" @click="load">
          {{ tr('加载失败，重试', 'Loading failed. Retry') }}
        </button>
        <template v-else>{{
          loading ? tr('加载中…', 'Loading…') : tr(`${matches.length} 个会话`, `${matches.length} sessions`)
        }}</template>
      </span>
      <span class="quick-hints launcher-hints"
        ><span><kbd>↑</kbd><kbd>↓</kbd> {{ tr('选择', 'Select') }}</span
        ><span><kbd>↵</kbd> {{ tr('打开', 'Open') }}</span
        ><span><kbd>esc</kbd> {{ tr('关闭', 'Close') }}</span></span
      >
    </div>
  </Modal>
</template>
<style scoped>
.quick-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--fg-subtle);
}
.quick-kind .icon {
  width: 16px;
  height: 16px;
}
.quick-kind.running,
.quick-result[aria-selected='true'] .quick-kind.idle {
  color: var(--accent);
}
.quick-path {
  max-width: 32%;
  text-align: right;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--fg-subtle);
  font-size: 12px;
}
.quick-result strong {
  flex: 1;
  min-width: 0;
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.quick-kind.compacting {
  color: var(--ok);
}
.quick-kind.waiting,
.quick-kind.queued {
  color: var(--warn);
}
.quick-kind.error {
  color: var(--danger);
}
@media (prefers-reduced-motion: reduce) {
  .quick-kind .spin {
    animation: none;
  }
}
.quick-empty {
  padding: 28px 12px;
  text-align: center;
  color: var(--fg-subtle);
  font-size: 13px;
}
.quick-more,
.quick-retry {
  border: 0;
  background: transparent;
  color: var(--fg-subtle);
  font: inherit;
  cursor: pointer;
}
.quick-more {
  width: 100%;
  padding: 10px;
  font-size: 12px;
}
.quick-more:hover,
.quick-retry:hover {
  color: var(--accent);
}
</style>
