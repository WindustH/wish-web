<script setup lang="ts">
import { ref } from 'vue';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import { copyText } from '../../ui/clipboard.ts';
import {
  activityCount,
  activityStorageFailed,
  exportActivity,
  clearActivity,
  ACTIVITY_LIMIT,
} from '../../ui/domain/diagnostics/activityStore.ts';
const snapshot = ref(exportActivity());
function refresh() {
  snapshot.value = exportActivity();
}
function clear() {
  clearActivity();
  refresh();
}
function download() {
  const url = URL.createObjectURL(new Blob([exportActivity()], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `wish-debug-${new Date().toISOString().replaceAll(':', '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <p class="hint">
    {{
      tr(
        `保留最近 ${ACTIVITY_LIMIT} 条记录，当前标签页刷新后仍可导出，关闭标签页后清除。高频移动、滚动和输入事件合并采样；不记录输入正文、文件内容、请求正文或认证信息。`,
        `Keeps the latest ${ACTIVITY_LIMIT} records across reloads in this tab; closing the tab clears them. Frequent movement, scrolling and input events are sampled. Input text, file contents, request bodies and credentials are excluded.`,
      )
    }}
  </p>
  <p v-if="activityStorageFailed" role="alert">
    {{
      tr('本地保存失败，请在关闭页面前导出当前日志。', 'Local storage failed. Export the log before closing this page.')
    }}
  </p>
  <div class="activity-actions">
    <span>{{ activityCount }} {{ tr('条记录', 'records') }}</span>
    <button class="btn" @click="download"><Icon name="download" />{{ tr('导出日志', 'Export log') }}</button>
    <button class="btn ghost" @click="copyText(exportActivity())">{{ tr('复制', 'Copy') }}</button>
    <button class="btn ghost" @click="refresh">{{ tr('刷新预览', 'Refresh preview') }}</button>
    <button class="btn ghost" @click="clear">{{ tr('清空', 'Clear') }}</button>
  </div>
  <pre class="activity-preview">{{ snapshot }}</pre>
</template>
<style scoped>
.activity-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}
.activity-actions > span {
  color: var(--fg-subtle);
  font-size: 12px;
  margin-right: auto;
}
.activity-preview {
  max-height: 50dvh;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-inset);
  font-size: 11px;
}
</style>
