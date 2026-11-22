<script setup lang="ts">
// What Wish keeps on disk: the total, a bar of its parts, and a row per part. The two databases
// open in place to what they hold - their records, indexes and the room SQLite keeps - read when
// opened, since measuring reads every page of both.
import { computed, ref, onBeforeUnmount } from 'vue';
import * as api from '../../core/api/endpoints.ts';
import type { StorageDetail, StorageKind, StorageSnapshot } from '../../core/api/types.ts';
import { errorDetail } from '../../core/errors.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{
  storage: StorageSnapshot;
  selectedBytes?: number;
  order?: string;
  archivesOpen: boolean;
}>();
const emit = defineEmits<{ sort: [key: 'attachments' | 'shell']; archives: [] }>();
const number = computed(() => new Intl.NumberFormat(i18n.locale.value).format);
const percent = computed(
  () => new Intl.NumberFormat(i18n.locale.value, { style: 'percent', maximumFractionDigits: 1 }).format,
);

type Database = keyof StorageDetail;
const parts = computed(() =>
  [
    {
      key: 'session_data',
      name: tr('会话数据', 'Session data'),
      what: tr('历史、上下文和搜索索引', 'History, context and the search index'),
      bytes: props.storage.bytes.session_data,
      database: 'session_data' as Database,
    },
    {
      key: 'blobs',
      sort: 'attachments' as const,
      name: tr('资源文件', 'Resource files'),
      what: tr('发给会话的图片与文件', 'Images and files sent to sessions'),
      bytes: props.storage.bytes.blobs,
    },
    {
      key: 'executions',
      sort: 'shell' as const,
      name: tr('执行输出', 'Execution output'),
      what: tr('Shell 命令留下的输出', 'What shell commands printed'),
      bytes: props.storage.bytes.executions,
    },
    {
      key: 'service_data',
      name: tr('服务数据', 'Service data'),
      what: tr('会话列表和用量记录', 'The session list and usage records'),
      bytes: props.storage.bytes.service_data,
      database: 'service_data' as Database,
    },
    ...(props.storage.bytes.archives != null
      ? [
          {
            key: 'archives',
            name: tr('归档文件', 'Archives'),
            what: tr('保存的归档包', 'Retained ZIP packages'),
            bytes: props.storage.bytes.archives,
          },
        ]
      : []),
  ].map((part, index) => ({ ...part, color: `var(--chart-${index + 1})` })),
);
const total = computed(() => props.storage.bytes.total);
const archivePart = computed(() => parts.value.find((part) => part.key === 'archives' && part.bytes > 0));
const activeParts = computed(() => parts.value.filter((part) => part.key !== 'archives' && part.bytes > 0));
const activeBytes = computed(() => activeParts.value.reduce((sum, part) => sum + part.bytes, 0));

const selectedShare = computed(() =>
  total.value && props.selectedBytes != null ? Math.min(1, props.selectedBytes / total.value) : 0,
);
const reclaimWidth = computed(() =>
  activeBytes.value ? Math.min(100, ((props.selectedBytes ?? 0) / activeBytes.value) * 100) : 0,
);
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
  calls: ['Token 用量记录', 'Token usage records'],
  stream_samples: ['速度采样点', 'Speed samples'],
  other: ['结构与其他', 'Schema and other'],
  free: ['空闲页', 'Free pages'],
  journal: ['预写日志', 'Write-ahead log'],
};
const SERVICE_LABELS: Record<string, [string, string]> = { sessions: ['会话列表', 'Session list'] };
function kinds(database: Database, list: StorageKind[]) {
  const sum = list.reduce((all, row) => all + row.bytes, 0);
  return list
    .filter((row) => row.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .map((row) => {
      const pair = (database === 'service_data' && SERVICE_LABELS[row.kind]) ||
        LABELS[row.kind] || [row.kind, row.kind];
      return { kind: row.kind, name: tr(pair[0], pair[1]), bytes: row.bytes, share: sum ? row.bytes / sum : 0 };
    });
}

// The kinds that take a hundredth or more show at once; the smaller ones on asking.
const SMALL = 0.01;
const showSmall = ref(false);

// One reading covers both databases; opening either reads afresh.
const opened = ref<Database | null>(null);
const detail = ref<StorageDetail | null>(null);
const databaseKinds = computed(() => ({
  session_data: kinds('session_data', detail.value?.session_data ?? []),
  service_data: kinds('service_data', detail.value?.service_data ?? []),
}));
const failed = ref<unknown>(null);
let detailController = new AbortController();
onBeforeUnmount(() => detailController.abort());
async function toggle(database: Database) {
  detailController.abort();
  const own = (detailController = new AbortController());
  opened.value = opened.value === database ? null : database;
  showSmall.value = false;
  if (!opened.value) return;
  failed.value = null;
  try {
    const value = await api.storageDetail({ signal: own.signal });
    if (!own.signal.aborted) detail.value = value;
  } catch (error) {
    if (!own.signal.aborted) failed.value = error;
  }
}
</script>

<template>
  <section class="storage-card">
    <div
      class="storage-bar"
      role="img"
      :aria-label="parts.map((part) => `${part.name}: ${fmtBytes(part.bytes)}`).join(', ')"
    >
      <div v-if="activeParts.length" class="storage-active-bar" :style="{ flexGrow: activeBytes }">
        <span v-for="part in activeParts" :key="part.key" :style="{ flexGrow: part.bytes, background: part.color }" />
        <i v-if="reclaimWidth" class="reclaim-mark" :style="{ width: reclaimWidth + '%' }" aria-hidden="true" />
      </div>
      <span v-if="archivePart" :style="{ flexGrow: archivePart.bytes, background: archivePart.color }" />
    </div>
    <p v-if="selectedBytes != null" class="reclaim-value" role="status">
      {{ tr('所选历史预计释放 ', 'Selected history could free ') }}<strong>{{ fmtBytes(selectedBytes) }}</strong> ·
      {{ percent(selectedShare) }}
    </p>
    <ul class="storage-parts">
      <li v-for="part in parts" :key="part.key" :style="{ '--part-color': part.color }">
        <button
          type="button"
          class="storage-part"
          :data-hint="part.what"
          :aria-pressed="part.key === 'archives' ? archivesOpen : part.sort ? order === part.sort : undefined"
          :aria-expanded="part.database ? opened === part.database : undefined"
          @click="part.database ? toggle(part.database) : part.sort ? emit('sort', part.sort) : emit('archives')"
        >
          <i class="storage-dot" aria-hidden="true" />
          <span class="storage-part-text">{{ part.name }}</span>
          <Hint :text="`${number(part.bytes)} B`"
            ><span class="storage-figure"
              ><strong>{{ fmtBytes(part.bytes) }}</strong></span
            ></Hint
          >
          <Icon v-if="part.database || part.key === 'archives'" name="chevron-right" class="storage-chevron" />
          <Icon v-else name="arrow-down" class="storage-chevron" />
        </button>
        <div v-if="opened && part.database === opened" class="storage-kinds">
          <p v-if="failed" class="storage-kinds-state" role="alert">{{ errorDetail(failed) }}</p>
          <p v-else-if="!detail" class="storage-kinds-state" role="status"><Spinner /></p>
          <ul v-else>
            <template v-for="kind in databaseKinds[opened]" :key="kind.kind">
              <li v-if="showSmall || kind.share >= SMALL">
                <span class="storage-kind-name">{{ kind.name }}</span>
                <span class="storage-kind-bar" aria-hidden="true"
                  ><i :style="{ width: `${kind.share * 100}%` }"
                /></span>
                <small class="storage-share">{{ percent(kind.share) }}</small>
                <Hint :text="`${number(kind.bytes)} B`"
                  ><strong class="storage-bytes">{{ fmtBytes(kind.bytes) }}</strong></Hint
                >
              </li>
            </template>
            <li v-if="!showSmall && databaseKinds[opened].some((kind) => kind.share < SMALL)">
              <button type="button" class="storage-more" @click="showSmall = true">
                {{
                  tr(
                    `还有 ${databaseKinds[opened].filter((kind) => kind.share < SMALL).length} 项，各占不到 1%`,
                    `${databaseKinds[opened].filter((kind) => kind.share < SMALL).length} more, each under 1%`,
                  )
                }}
              </button>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.reclaim-value {
  font-size: 12px;
  color: var(--fg-muted);
  margin: 6px 0;
}
.reclaim-mark {
  position: absolute;
  inset: 0 0 0 auto;
  background: repeating-linear-gradient(-45deg, transparent 0 2px, var(--fg) 2px 3px);
  border-left: 1px solid var(--bg);
}
.storage-bar {
  display: flex;
  gap: 2px;
  height: 6px;
  margin: 0 0 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-sunken);
}
.storage-active-bar {
  position: relative;
  display: flex;
  gap: 2px;
  min-width: 0;
  flex: 0 1 0;
}
.storage-bar span {
  flex: 0 1 0;
  min-width: 4px;
}
.storage-parts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  list-style: none;
  margin: 0;
  padding: 0;
}
.storage-part {
  display: grid;
  align-items: center;
  grid-template-columns: 8px minmax(0, 1fr) auto 15px;
  gap: 3px 6px;
  width: 100%;
  padding: 7px 0;
  background: none;
  border: 0;
  font: inherit;
  color: var(--fg-muted);
  text-align: start;
}
button.storage-part {
  cursor: pointer;
}
button.storage-part:hover {
  color: var(--fg);
}
.storage-dot {
  height: 8px;
  width: 8px;
  background: var(--part-color);
  border-radius: 50%;
}
.storage-part-text {
  font-size: 13px;
}
.storage-figure {
  grid-column: 3;
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.storage-figure strong {
  font-weight: 550;
  color: var(--fg);
  font-size: 14px;
}
.storage-part[aria-pressed='true'] {
  color: var(--accent);
}
.storage-chevron {
  grid-row: 1;
  grid-column: 4;
}
.storage-share {
  flex: none;
  min-width: 44px;
  color: var(--fg-subtle);
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.storage-bytes {
  display: block;
  min-width: 64px;
  font-size: 12.5px;
  font-weight: 400;
  color: var(--fg-muted);
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.storage-chevron {
  flex: none;
  width: 15px;
  height: 15px;
  color: var(--fg-subtle);
  transition:
    transform var(--dur-fast) ease,
    color var(--dur-fast);
}
[aria-expanded='true'] > .storage-chevron {
  transform: rotate(90deg);
}
/* What a database holds, under its row and in from its dot. */
.storage-kinds {
  margin: 8px;
  padding: 2px 0 2px 12px;
  border-left: 2px solid color-mix(in srgb, var(--part-color) 45%, transparent);
}
.storage-kinds ul {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.storage-kinds li {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 4px 0;
  font-size: 12.5px;
}
.storage-kind-name {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.storage-kind-bar {
  flex: 0 1 140px;
  height: 4px;
  border-radius: 999px;
  background: var(--bg-sunken);
  overflow: hidden;
}
.storage-kind-bar i {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: inherit;
  background: var(--part-color);
  opacity: 0.8;
}
.storage-more {
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--fg-subtle);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
@media (hover: hover) {
  .storage-more:hover {
    color: var(--fg);
  }
}
.storage-kinds-state {
  display: flex;
  margin: 0;
  padding: 6px 0;
  color: var(--fg-subtle);
  font-size: 12.5px;
}
@media (max-width: 599px) {
  .storage-kind-bar {
    display: none;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .storage-kinds {
    animation: detail-in 140ms ease-out;
  }
  @keyframes detail-in {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .storage-chevron {
    transition: none;
  }
}
</style>
