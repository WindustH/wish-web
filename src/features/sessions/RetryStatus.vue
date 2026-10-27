<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { retrySecondsLeft, type UpstreamRetry } from '../../core/upstreamRetry.ts';
import { tr } from '../../core/i18n/tr.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ retries: UpstreamRetry[] }>();
const detailsId = useId();
const expandedRequests = ref(new Set<string>());
function toggleFailure(requestId: string) {
  const next = new Set(expandedRequests.value);
  if (next.has(requestId)) next.delete(requestId);
  else next.add(requestId);
  expandedRequests.value = next;
}
watch(() => props.retries.map(retry => retry.requestId), ids => {
  const activeIds = new Set(ids);
  expandedRequests.value = new Set([...expandedRequests.value].filter(id => activeIds.has(id)));
});
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
  account_state: tr('账户查询', 'Account query'), web_search: tr('网页搜索', 'Web search'), web_fetch: tr('网页读取', 'Web fetch'),
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
      <div v-if="retry.failure" class="retry-reason">
        <button type="button" class="retry-reason-toggle" :aria-expanded="expandedRequests.has(retry.requestId)" :aria-controls="`${detailsId}-${retry.requestId}`"
          @click="toggleFailure(retry.requestId)">
          <Icon :name="expandedRequests.has(retry.requestId) ? 'chevron-down' : 'chevron-right'" />
          <span>{{ tr('失败原因', 'Failure details') }}</span>
        </button>
        <div :id="`${detailsId}-${retry.requestId}`" v-show="expandedRequests.has(retry.requestId)" class="retry-reason-content">
          <p>{{ retry.failure.message }}</p><small v-if="retry.failure.family">{{ retry.failure.family }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.retry-status-list { display:grid; gap:10px; white-space:normal; }
.upstream-retry { padding:12px 16px; border:1px solid var(--warn-border); border-radius:var(--radius); background:var(--warn-bg); color:var(--warn); overflow-wrap:anywhere; }
.retry-title { display:flex; align-items:center; gap:8px; color:inherit; font-size:13px; }
.retry-wait { margin:6px 0 0 24px; font-size:13px; font-variant-numeric:tabular-nums; }
.retry-reason { margin:8px 0 0 24px; font-size:12px; }
.retry-reason-toggle { display:flex; align-items:center; gap:5px; min-height:30px; padding:3px 0; border:0; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.retry-reason-toggle .icon { width:14px; height:14px; flex:none; }
.retry-reason-toggle:focus-visible { outline:2px solid currentColor; outline-offset:3px; border-radius:3px; }
.retry-reason-content { padding-left:19px; }
.retry-reason p { white-space:pre-wrap; margin:6px 0; user-select:text; }
</style>
