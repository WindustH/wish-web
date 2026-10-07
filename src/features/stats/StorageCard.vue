<script setup lang="ts">
// What Wish keeps on disk: the total, a bar of its parts, and a row per part. The two databases
// open in place to what they hold - their records, indexes and the room SQLite keeps - read when
// opened, since measuring reads every page of both.
import { computed, ref } from 'vue';
import * as api from '../../core/api/endpoints.ts';
import type { StorageDetail, StorageKind, StorageSnapshot } from '../../core/api/types.ts';
import { errorDetail } from '../../core/errors.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ storage: StorageSnapshot; color: (index: number) => string }>();
const number = (value: number) => new Intl.NumberFormat(i18n.locale.value).format(value);
const percent = (value: number) => new Intl.NumberFormat(i18n.locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(value);

type Database = keyof StorageDetail;
const parts = computed(() => [
  { key: 'session_data', name: tr('会话数据', 'Session data'), what: tr('历史、上下文和搜索索引', 'History, context and the search index'), bytes: props.storage.bytes.session_data, database: 'session_data' as Database },
  { key: 'blobs', name: tr('资源文件', 'Resource files'), what: tr('发给会话和群组的图片与文件', 'Images and files sent to sessions and groups'), bytes: props.storage.bytes.blobs },
  { key: 'executions', name: tr('执行输出', 'Execution output'), what: tr('Shell 命令留下的输出', 'What shell commands printed'), bytes: props.storage.bytes.executions },
  { key: 'service_data', name: tr('服务数据', 'Service data'), what: tr('会话列表、群组和用量记录', 'The session list, groups and usage records'), bytes: props.storage.bytes.service_data, database: 'service_data' as Database },
].map((part, index) => ({ ...part, color: props.color(index) })));
const total = computed(() => props.storage.bytes.total);

const LABELS: Record<string, [string, string]> = {
  sessions: ['会话记录', 'Session records'],
  history_index: ['历史索引', 'History index'],
  search_index: ['全文搜索索引', 'Full-text search index'],
  messages: ['消息', 'Messages'],
  events: ['运行事件', 'Run events'],
  history: ['历史记录', 'History records'],
  context: ['上下文', 'Context'],
  model_calls: ['模型调用记录', 'Model call records'],
  queue: ['输入队列', 'Input queue'],
  groups: ['群组与成员', 'Groups and members'],
  group_messages: ['群聊消息', 'Group messages'],
  calls: ['Token 用量记录', 'Token usage records'],
  stream_samples: ['速度采样点', 'Speed samples'],
  other: ['结构与其他', 'Schema and other'],
  free: ['空闲页', 'Free pages'],
  journal: ['预写日志', 'Write-ahead log'],
};
const SERVICE_LABELS: Record<string, [string, string]> = { sessions: ['会话列表', 'Session list'] };
function kinds(database: Database, list: StorageKind[]) {
  const sum = list.reduce((all, row) => all + row.bytes, 0);
  return list.filter(row => row.bytes > 0).sort((a, b) => b.bytes - a.bytes).map(row => {
    const pair = (database === 'service_data' && SERVICE_LABELS[row.kind]) || LABELS[row.kind] || [row.kind, row.kind];
    return { kind: row.kind, name: tr(pair[0], pair[1]), bytes: row.bytes, share: sum ? row.bytes / sum : 0 };
  });
}

// The kinds that take a hundredth or more show at once; the smaller ones on asking.
const SMALL = 0.01;
const showSmall = ref(false);

// One reading covers both databases; opening either reads afresh.
const opened = ref<Database | null>(null);
const detail = ref<StorageDetail | null>(null);
const failed = ref<unknown>(null);
async function toggle(database: Database) {
  opened.value = opened.value === database ? null : database;
  showSmall.value = false;
  if (!opened.value) return;
  failed.value = null;
  try { detail.value = await api.storageDetail(); } catch (error) { failed.value = error; }
}
</script>

<template>
  <section class="statistics-panel storage-card">
    <header class="storage-head">
      <h2>{{ i18n.t('stats.storage') }}</h2>
      <Hint :text="`${number(total)} B`"><strong class="storage-total">{{ fmtBytes(total) }}</strong></Hint>
    </header>
    <div class="storage-bar" role="img" :aria-label="parts.map(part => `${part.name}: ${fmtBytes(part.bytes)}`).join(', ')">
      <template v-for="part in parts" :key="part.key"><span v-if="part.bytes > 0" :style="{ flexGrow: part.bytes, background: part.color }" /></template>
    </div>
    <ul class="storage-parts">
      <li v-for="part in parts" :key="part.key" :style="{ '--part-color': part.color }">
        <component :is="part.database ? 'button' : 'div'" class="storage-part" :type="part.database ? 'button' : undefined"
          :aria-expanded="part.database ? opened === part.database : undefined" @click="part.database && toggle(part.database)">
          <i class="storage-dot" aria-hidden="true" />
          <span class="storage-part-text"><span>{{ part.name }}</span><small>{{ part.what }}</small></span>
          <Hint :text="`${number(part.bytes)} B`"><span class="storage-figure"><strong>{{ fmtBytes(part.bytes) }}</strong><small>{{ percent(total ? part.bytes / total : 0) }}</small></span></Hint>
          <Icon v-if="part.database" name="chevron-right" class="storage-chevron" />
          <span v-else class="storage-chevron" aria-hidden="true" />
        </component>
        <div v-if="part.database && opened === part.database" class="storage-kinds">
          <p v-if="failed" class="storage-kinds-state" role="alert">{{ errorDetail(failed) }}</p>
          <p v-else-if="!detail" class="storage-kinds-state" role="status"><Spinner /></p>
          <ul v-else>
            <template v-for="kind in kinds(part.database, detail[part.database])" :key="kind.kind">
              <li v-if="showSmall || kind.share >= SMALL">
                <span class="storage-kind-name">{{ kind.name }}</span>
                <span class="storage-kind-bar" aria-hidden="true"><i :style="{ width: `${kind.share * 100}%` }" /></span>
                <small class="storage-share">{{ percent(kind.share) }}</small>
                <Hint :text="`${number(kind.bytes)} B`"><strong class="storage-bytes">{{ fmtBytes(kind.bytes) }}</strong></Hint>
              </li>
            </template>
            <li v-if="!showSmall && kinds(part.database, detail[part.database]).some(kind => kind.share < SMALL)">
              <button type="button" class="storage-more" @click="showSmall = true">{{ tr(`还有 ${kinds(part.database, detail[part.database]).filter(kind => kind.share < SMALL).length} 项，各占不到 1%`, `${kinds(part.database, detail[part.database]).filter(kind => kind.share < SMALL).length} more, each under 1%`) }}</button>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.storage-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.storage-head h2 { margin: 0; font: 600 14px/1.5 var(--font); }
.storage-total { font-size: 24px; font-weight: 600; line-height: 1.2; letter-spacing: -.02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.storage-bar { display: flex; gap: 2px; height: 8px; margin: 14px 0 6px; overflow: hidden; border-radius: 999px; background: var(--bg-sunken); }
.storage-bar span { flex: 0 1 0; min-width: 4px; }
.storage-parts { margin: 0; padding: 0; list-style: none; }
.storage-parts > li + li { border-top: 1px solid var(--line); }
/* A part's row: what it is, then its share and size; a database's opens to what it holds. */
.storage-part { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; padding: 10px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; }
button.storage-part { cursor: pointer; border-radius: 6px; }
@media (hover: hover) { button.storage-part:hover .storage-part-text > span { color: var(--fg); } button.storage-part:hover .storage-chevron { color: var(--fg-muted); } }
button.storage-part:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.storage-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--part-color); }
.storage-part-text { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 1px; }
.storage-part-text > span { color: var(--fg); font-size: 13.5px; transition: color var(--dur-fast); }
.storage-part-text small { color: var(--fg-subtle); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.storage-figure { display: flex; flex: none; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 64px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.storage-figure strong { font-size: 13.5px; font-weight: 500; }
.storage-figure small { color: var(--fg-subtle); font-size: 12px; }
.storage-share { flex: none; min-width: 44px; color: var(--fg-subtle); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
.storage-bytes { display: block; min-width: 64px; font-size: 12.5px; font-weight: 400; color: var(--fg-muted); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.storage-chevron { flex: none; width: 15px; height: 15px; color: var(--fg-subtle); transition: transform var(--dur-fast) ease, color var(--dur-fast); }
[aria-expanded='true'] > .storage-chevron { transform: rotate(90deg); }
/* What a database holds, under its row and in from its dot. */
.storage-kinds { margin: -2px 27px 10px 20px; padding: 2px 0 2px 12px; border-left: 2px solid color-mix(in srgb, var(--part-color) 45%, transparent); }
.storage-kinds ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.storage-kinds li { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 4px 0; font-size: 12.5px; }
.storage-kind-name { flex: 1 1 auto; min-width: 0; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.storage-kind-bar { flex: 0 1 140px; height: 4px; border-radius: 999px; background: var(--bg-sunken); overflow: hidden; }
.storage-kind-bar i { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--part-color); opacity: .8; }
.storage-more { padding: 2px 0; border: 0; background: none; color: var(--fg-subtle); font: inherit; font-size: 12.5px; cursor: pointer; }
@media (hover: hover) { .storage-more:hover { color: var(--fg); } }
.storage-kinds-state { display: flex; margin: 0; padding: 6px 0; color: var(--fg-subtle); font-size: 12.5px; }
@media (max-width: 599px) {
  .storage-part { gap: 10px; }
  .storage-part-text small { white-space: normal; }
  .storage-kinds { margin-right: 25px; }
  .storage-kind-bar { display: none; }
}
@media (prefers-reduced-motion: reduce) { .storage-chevron { transition: none; } }
</style>
