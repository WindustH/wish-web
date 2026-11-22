<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { archivesList, archiveDelete, archiveDownloadGrant } from '../../core/api/endpoints.ts';
import type { ArchiveRecord, ArchiveKind } from '../../core/api/types.ts';
import { absUrl, getConnectionScope, needsAccessToken } from '../../core/api/client.ts';
import { fmtBytes } from '../../core/util/fmt.ts';
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { savePackage } from '../../ui/download.ts';
import { toast } from '../../ui/toast.ts';
import { packageUrl } from '../sessions/sessionPackages.ts';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import Menu from '../../ui/components/Menu.vue';
const props = defineProps<{ revision: number }>();
const emit = defineEmits<{ changed: [] }>();
const query = ref(''),
  order = ref<'time' | 'size'>('time'),
  rows = ref<ArchiveRecord[]>([]),
  next = ref<string | null>(null);
const loading = ref(false),
  error = ref(''),
  confirm = ref<ArchiveRecord>(),
  deleting = ref(false),
  deleteError = ref('');
const downloading = ref(new Set<string>());
const labels = computed<Record<ArchiveKind, string>>(() => ({
  session: tr('完整会话', 'Full session'),
  history_prune: tr('历史归档', 'History'),
  library_cleanup: tr('库清理', 'Library cleanup'),
  usage_prune: tr('用量记录', 'Usage records'),
}));
const dates = computed(() => new Intl.DateTimeFormat(i18n.locale.value, { dateStyle: 'medium', timeStyle: 'short' }));
const nameOf = (row: ArchiveRecord) => row.name.trim() || row.session_id || labels.value[row.kind];
const orders = computed(() => [
  { key: 'time', label: tr('最新归档', 'Newest first'), checked: order.value === 'time' },
  { key: 'size', label: tr('占用最大', 'Largest first'), checked: order.value === 'size' },
]);
let controller: AbortController | undefined;
async function load(more = false) {
  controller?.abort();
  const own = (controller = new AbortController());
  loading.value = true;
  error.value = '';
  try {
    const result = await archivesList(
      { limit: 30, q: query.value.trim(), order: order.value, cursor: more ? (next.value ?? undefined) : undefined },
      { signal: own.signal },
    );
    if (!own.signal.aborted) {
      rows.value = more ? [...rows.value, ...result.items] : result.items;
      next.value = result.next;
    }
  } catch (e) {
    if (!own.signal.aborted) error.value = describeError(e).message;
  } finally {
    if (!own.signal.aborted) loading.value = false;
  }
}
watch(
  [query, order, () => props.revision],
  (_, old, cleanup) => {
    controller?.abort();
    if (old && (old[0] !== query.value || old[1] !== order.value)) rows.value = [];
    next.value = null;
    loading.value = true;
    const timer = setTimeout(() => load(), old && old[0] !== query.value ? 180 : 0);
    cleanup(() => clearTimeout(timer));
  },
  { immediate: true },
);
onScopeDispose(() => controller?.abort());
async function download(row: ArchiveRecord) {
  if (downloading.value.has(row.archive_id)) return;
  downloading.value.add(row.archive_id);
  const scope = getConnectionScope();
  const path = '/archives/' + encodeURIComponent(row.archive_id) + '/download';
  try {
    const url = needsAccessToken(absUrl(path))
      ? packageUrl((await archiveDownloadGrant(row.archive_id)).download_url, path)
      : absUrl(path);
    if (scope === getConnectionScope()) await savePackage(url, 'archive-' + row.kind + '-' + row.archive_id + '.zip');
  } catch (e) {
    toast(nameOf(row) + ' · ' + describeError(e).message, { tone: 'error' });
  } finally {
    downloading.value.delete(row.archive_id);
  }
}
async function remove() {
  const row = confirm.value;
  if (!row || deleting.value || loading.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await archiveDelete(row.archive_id);
    rows.value = rows.value.filter((r) => r.archive_id !== row.archive_id);
    confirm.value = undefined;
    emit('changed');
  } catch (e) {
    deleteError.value = describeError(e).message;
  } finally {
    deleting.value = false;
  }
}
</script>
<template>
  <div class="archives">
    <div class="archive-tools">
      <label
        ><Icon name="search" /><input
          type="search"
          v-model="query"
          :placeholder="tr('搜索归档名称', 'Search archives')"
          :aria-label="tr('搜索归档', 'Search archives')"
      /></label>
      <Menu :items="orders" :label="tr('归档排序', 'Sort archives')" @select="order = $event as 'size' | 'time'"
        ><template #trigger
          ><button class="btn">
            <Icon name="chevrons-up-down" />{{ orders.find((o) => o.checked)?.label }}
          </button></template
        ></Menu
      >
    </div>
    <p v-if="error" class="load-error" role="alert">
      {{ error }} <button class="btn sm" @click="load()">{{ tr('重试', 'Retry') }}</button>
    </p>
    <p v-if="loading" class="hint" role="status">
      <Icon name="loader-circle" class="spin" /> {{ tr('正在读取归档…', 'Loading archives…') }}
    </p>
    <p v-else-if="!rows.length && !error" class="hint">
      {{ query ? tr('没有匹配的归档。', 'No matching archives.') : tr('还没有归档。', 'No archives yet.') }}
    </p>
    <ul v-if="rows.length">
      <li v-for="r in rows" :key="r.archive_id">
        <div>
          <strong>{{ nameOf(r) }}</strong
          ><small>{{ labels[r.kind] }} · {{ dates.format(r.archived_at) }}</small>
        </div>
        <span :title="tr('原始大小 ', 'Original size ') + fmtBytes(r.original_bytes)">{{
          fmtBytes(r.archive_bytes)
        }}</span
        ><button
          class="btn ghost icon-only"
          :aria-label="tr('下载归档', 'Download archive') + ' ' + nameOf(r)"
          :disabled="downloading.has(r.archive_id)"
          :aria-busy="downloading.has(r.archive_id)"
          @click="download(r)"
        >
          <Icon v-if="downloading.has(r.archive_id)" name="loader-circle" class="spin" /><Icon
            v-else
            name="download"
          /></button
        ><button
          class="btn ghost icon-only"
          :aria-label="tr('删除归档', 'Delete archive') + ' ' + nameOf(r)"
          :disabled="loading || downloading.has(r.archive_id)"
          @click="
            deleteError = '';
            confirm = r;
          "
        >
          <Icon name="trash-2" />
        </button>
      </li>
    </ul>
    <button v-if="next" class="btn" :disabled="loading || deleting" @click="load(true)">
      {{ tr('加载更多', 'Load more') }}
    </button>
    <Modal
      v-if="confirm"
      compact
      :open="true"
      :dismissable="!deleting"
      :title="tr('永久删除归档？', 'Permanently delete archive?')"
      @close="confirm = undefined"
      ><p>{{ nameOf(confirm) }} · {{ fmtBytes(confirm.archive_bytes) }}</p>
      <p>{{ tr('服务器上的这份 ZIP 将被永久删除。', 'This ZIP will be permanently removed from the server.') }}</p>
      <p v-if="deleteError" class="load-error" role="alert">{{ deleteError }}</p>
      <template #footer
        ><button class="btn ghost" :disabled="deleting" @click="confirm = undefined">{{ tr('取消', 'Cancel') }}</button
        ><button class="btn danger solid" :disabled="deleting || loading" @click="remove">
          {{ tr('删除归档', 'Delete archive') }}
        </button></template
      ></Modal
    >
  </div>
</template>
<style scoped>
.archives {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.archive-tools {
  display: flex;
  gap: 8px;
}
.archive-tools label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 7px 10px;
}
.archive-tools input {
  background: transparent;
  color: inherit;
  font: inherit;
  border: 0;
  width: 100%;
  min-width: 0;
}
.archives ul {
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-raised);
  list-style: none;
}
.archives li {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px;
}
.archives li + li {
  border-top: 1px solid var(--line);
}
.archives li div {
  flex: 1;
  min-width: 0;
}
.archives strong,
.archives small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.archives small,
.archives li span {
  color: var(--fg-subtle);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.archives .icon {
  width: 16px;
  height: 16px;
}
.archives li button {
  min-height: 40px;
  min-width: 36px;
}
.archives p {
  margin: 0;
}
@media (max-width: 899px) {
  .archive-tools label,
  .archives ul {
    border: 0;
    background: var(--bg-group);
  }
  .archive-tools label {
    border-radius: 12px;
  }
  .archives ul {
    border-radius: 16px;
  }
}
</style>
