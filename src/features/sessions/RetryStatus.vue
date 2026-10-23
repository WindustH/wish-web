<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { retrySecondsLeft, type UpstreamRetry } from '../../core/upstreamRetry.ts';
import { tr } from '../../core/i18n/tr.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import Icon from '../../ui/components/Icon.vue';

defineProps<{ retries: UpstreamRetry[] }>();
const active = usePageActivity();
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => watch(active, value => {
  clearInterval(timer);
  if (value) { now.value = Date.now(); timer = setInterval(() => { now.value = Date.now(); }, 500); }
}, { immediate: true }));
onBeforeUnmount(() => clearInterval(timer));
const name = (operation: string) => ({
  model: tr('模型请求', 'Model request'), compaction: tr('上下文压缩', 'Context compaction'),
  token_count: tr('Token 计数', 'Token count'), model_list: tr('模型列表', 'Model list'),
  account_state: tr('账户查询', 'Account query'), web_search: tr('网页搜索', 'Web search'),
}[operation] ?? tr('上游请求', 'Upstream request'));
</script>

<template>
  <div class="retry-status-list">
    <div v-for="retry in retries" :key="retry.requestId" class="upstream-retry">
      <div class="retry-title" role="status"><Icon class="work-spinner" name="loader-circle" /><strong>{{ name(retry.operation) }} · {{ tr('正在重试', 'Retrying') }}（{{ retry.retry }}/{{ retry.maxRetries }}）</strong></div>
      <p class="retry-wait">{{ retry.phase === 'attempting'
        ? tr('已重新发起请求，等待响应…', 'Request sent again, waiting for a response…')
        : retrySecondsLeft(retry, now) > 0
          ? tr(`${retrySecondsLeft(retry, now)} 秒后重试`, `Retrying in ${retrySecondsLeft(retry, now)}s`)
          : tr('即将重试…', 'Retrying shortly…') }}</p>
      <details v-if="retry.failure" class="retry-reason"><summary>{{ tr('失败原因', 'Failure details') }}</summary><p>{{ retry.failure.message }}</p><small v-if="retry.failure.family">{{ retry.failure.family }}</small></details>
    </div>
  </div>
</template>

<style scoped>
.retry-status-list { display:grid; gap:10px; white-space:normal; }
.upstream-retry { padding:12px 16px; border:1px solid var(--line); border-radius:var(--radius); background:var(--bg-raised); color:var(--fg-muted); overflow-wrap:anywhere; }
.retry-title { display:flex; align-items:center; gap:8px; color:var(--fg); font-size:13px; }
.retry-wait { margin:6px 0 0 24px; font-size:13px; font-variant-numeric:tabular-nums; }
.retry-reason { margin:8px 0 0 24px; font-size:12px; }
.retry-reason summary { cursor:pointer; }
.retry-reason p { white-space:pre-wrap; margin:6px 0; user-select:text; }
</style>
