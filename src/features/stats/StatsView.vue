<script setup lang="ts">
import Hint from '../../ui/components/Hint.vue';
import { computed, defineAsyncComponent, onActivated, onDeactivated, ref } from 'vue';
import { RefreshCw } from '@lucide/vue';
import { stats } from '../../core/state/statsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtBytes, fmtDateTime, fmtTokens, fmtUptime } from '../../core/util/fmt.js';
import Spinner from '../../ui/components/Spinner.vue';

const UsagePlot = defineAsyncComponent(() => import('../usage/UsagePlot.vue'));
const UsageCharts = defineAsyncComponent(() => import('../usage/UsageCharts.vue'));
const charts = ref<{ refresh: () => void }>();
function refresh() { void stats.refresh(); charts.value?.refresh(); }
const { status, usage, storage, version, loading, error, updatedAt } = stats;
const totals = computed(() => usage.value?.statistics.totals);
const rows = computed(() => usage.value?.statistics.by_provider_model ?? []);
const errorMessage = computed(() => error.value instanceof Error ? error.value.message : String(error.value));
const tx = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;
const number = (value: number) => new Intl.NumberFormat(i18n.locale.value).format(value);
const percent = (value: number | null) => value == null ? '—' : new Intl.NumberFormat(i18n.locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(value);
const models = computed(() => {
  const values = new Map<string, number>();
  for (const row of rows.value) {
    const name = row.model ?? tx('未记录', 'Not recorded');
    values.set(name, (values.get(name) ?? 0) + row.totals.tokens.total_tokens);
  }
  return Array.from(values, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
});
const modelTotal = computed(() => models.value.reduce((sum, item) => sum + item.value, 0));
const storageRows = computed(() => storage.value ? [
  { name: tx('会话数据', 'Session data'), value: storage.value.bytes.session_data },
  { name: tx('资源文件', 'Resource files'), value: storage.value.bytes.blobs },
  { name: tx('执行输出', 'Execution output'), value: storage.value.bytes.executions },
  { name: tx('服务数据', 'Service data'), value: storage.value.bytes.service_data },
] : []);
const color = (index: number) => `var(--chart-${index % 6 + 1})`;
onActivated(stats.startAuto);
onDeactivated(stats.stopAuto);
</script>

<template>
  <div class="page statistics-page">
    <div class="statistics-toolbar"><span v-if="updatedAt" class="hint">{{ tx('更新于', 'Updated at') }} {{ fmtDateTime(updatedAt) }}</span><button class="btn ghost" :disabled="loading" @click="refresh"><RefreshCw :size="17" />{{ i18n.t('stats.refresh') }}</button></div>
    <div class="statistics-body">
      <p v-if="error" class="load-error" role="alert">{{ errorMessage }}<span v-if="updatedAt">{{ tx('下方保留上次成功读取的数据。', 'The last successful snapshot remains below.') }}</span></p>
      <Spinner v-if="loading && !updatedAt" />
      <UsageCharts ref="charts">
        <section v-if="totals && usage" class="card statistics-usage">
          <h2>{{ i18n.t('stats.usage') }}</h2>
          <dl class="statistics-values">
            <div><dt>{{ i18n.t('stats.tokensIn') }}</dt><Hint :text="number(totals.tokens.input_tokens)"><dd data-stat="input">{{ fmtTokens(totals.tokens.input_tokens) }}</dd></Hint></div>
            <div><dt>{{ i18n.t('stats.tokensOut') }}</dt><Hint :text="number(totals.tokens.output_tokens)"><dd data-stat="output">{{ fmtTokens(totals.tokens.output_tokens) }}</dd></Hint></div>
            <div><dt>{{ i18n.t('stats.tokensTotal') }}</dt><Hint :text="number(totals.tokens.total_tokens)"><dd data-stat="total">{{ fmtTokens(totals.tokens.total_tokens) }}</dd></Hint></div>
            <div><dt>{{ i18n.t('stats.cacheHit') }}</dt><dd>{{ percent(totals.cache.request_hit_ratio) }}</dd></div>
            <div><dt>{{ i18n.t('stats.attempts') }}</dt><dd>{{ number(usage.statistics.model_attempts) }}</dd></div>
            <div><dt>{{ tx('已完成回复', 'Completed responses') }}</dt><dd>{{ number(totals.committed_responses) }}</dd></div>
          </dl>
          <h3>{{ tx('模型 Token 占比', 'Token share by model') }}</h3>
          <div v-if="modelTotal" class="model-share">
            <UsagePlot :pie="models" :label="tx('各模型总 Token 消耗占比', 'Total Token consumption by model')" />
            <ul class="distribution-legend">
              <li v-for="(item,index) in models" :key="item.name"><i :style="{ background: color(index) }" /><span>{{ item.name }}</span><strong>{{ percent(item.value / modelTotal) }}</strong></li>
            </ul>
          </div>
          <p v-else class="hint">{{ tx('还没有用量记录。', 'No usage records yet.') }}</p>
          <h3>{{ i18n.t('stats.byModel') }}</h3>
          <div class="statistics-table-wrap"><table class="table statistics-table">
            <thead><tr><th>{{ tx('提供商', 'Provider') }}</th><th>{{ tx('模型', 'Model') }}</th><th>{{ i18n.t('stats.tokensIn') }}</th><th>{{ i18n.t('stats.tokensOut') }}</th><th>{{ i18n.t('stats.tokensTotal') }}</th></tr></thead>
            <tbody><tr v-for="row in rows" :key="JSON.stringify([row.provider, row.model])">
              <td :data-label="tx('提供商', 'Provider')">{{ row.provider ?? tx('未记录', 'Not recorded') }}</td><td :data-label="tx('模型', 'Model')">{{ row.model ?? tx('未记录', 'Not recorded') }}</td>
              <td :data-label="i18n.t('stats.tokensIn')">{{ fmtTokens(row.totals.tokens.input_tokens) }}</td><td :data-label="i18n.t('stats.tokensOut')">{{ fmtTokens(row.totals.tokens.output_tokens) }}</td><td :data-label="i18n.t('stats.tokensTotal')">{{ fmtTokens(row.totals.tokens.total_tokens) }}</td>
            </tr><tr v-if="!rows.length"><td colspan="5" class="hint">{{ tx('还没有用量记录。', 'No usage records yet.') }}</td></tr></tbody>
          </table></div>
        </section>
      </UsageCharts>
      <div class="statistics-grid">
        <div class="statistics-footer">
        <section v-if="status" class="card statistics-detail">
          <h2>{{ tx('服务状态', 'Service status') }}</h2>
          <dl class="statistics-values">
            <div><dt>{{ tx('已保存会话', 'Stored sessions') }}</dt><dd>{{ number(status.counts.sessions) }}</dd></div>
            <div><dt>{{ tx('累计运行记录', 'Recorded runs') }}</dt><dd>{{ number(status.counts.runs) }}</dd></div>
            <div><dt>{{ tx('本次启动已运行', 'Uptime since startup') }}</dt><dd>{{ fmtUptime(status.uptime_ms) }}</dd></div>
            <div><dt>wishd {{ tx('版本', 'version') }}</dt><dd>{{ version?.version ?? '—' }}</dd></div>
          </dl>
          <h3>{{ i18n.t('stats.queue') }}</h3>
          <dl class="statistics-values">
            <div><dt>{{ tx('运行中会话', 'Running sessions') }}</dt><dd>{{ number(status.queue.active_sessions) }}</dd></div>
            <div><dt>{{ tx('待调度会话', 'Ready sessions') }}</dt><dd>{{ number(status.queue.ready_sessions) }}</dd></div>
            <div><dt>{{ tx('待处理消息', 'Pending messages') }}</dt><dd>{{ number(status.queue.pending_items) }}</dd></div>
            <div><dt>{{ tx('上下文压缩中会话', 'Compacting sessions') }}</dt><dd>{{ number(status.queue.compacting_sessions) }}</dd></div>
          </dl>
        </section>
        <section v-if="storage" class="card statistics-detail">
          <h2>{{ i18n.t('stats.storage') }}</h2>
          <div class="storage-summary"><span>{{ tx('文件总大小', 'Total file size') }}</span><Hint :text="`${number(storage.bytes.total)} B`"><strong>{{ fmtBytes(storage.bytes.total) }}</strong></Hint></div>
          <div class="storage-bar" role="img" :aria-label="storageRows.map(item => `${item.name}: ${fmtBytes(item.value)}`).join(', ')">
            <span v-for="(item,index) in storageRows" :key="item.name" :style="{ width: `${storage.bytes.total ? item.value / storage.bytes.total * 100 : 0}%`, background: color(index) }" />
          </div>
          <ul class="distribution-legend storage-legend">
            <li v-for="(item,index) in storageRows" :key="item.name"><i :style="{ background: color(index) }" /><span>{{ item.name }}</span><small>{{ percent(storage.bytes.total ? item.value / storage.bytes.total : 0) }}</small><Hint :text="`${number(item.value)} B`"><strong>{{ fmtBytes(item.value) }}</strong></Hint></li>
          </ul>
        </section>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.statistics-page { padding: 0 clamp(20px, 3vw, 40px) 32px; }
.statistics-page > * { width: 100%; max-width: 1100px; margin-inline: auto; }
.statistics-body { padding: 0; min-width: 0; }
.statistics-usage { min-width: 0; }
.statistics-toolbar { display: flex; flex: none; align-items: center; justify-content: end; gap: 12px; padding-block: 10px; }
.statistics-grid { display: grid; gap: 20px; min-width: 0; }
.statistics-footer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; min-width: 0; }
.statistics-grid .card { padding: 16px 0; min-width: 0; border-radius: 0; border: 0; border-top: 1px solid var(--line-strong); background: transparent; }
h2 { font: 600 16px/1.5 var(--font); margin: 0 0 16px; }
h3 { font-size: 14px; margin: 16px 0 12px; font-weight: 500; }
.statistics-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; margin: 0; }
dt { color: var(--fg-muted); font-size: 13px; }
dd { margin: 3px 0 0; font-size: 18px; font-weight: 500; letter-spacing: -.03em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.statistics-table-wrap { overflow-x: auto; }
.statistics-table { width: 100%; white-space: nowrap; }
.load-error { margin-bottom: 20px; }
@media (max-width: 899px) { .statistics-page { padding: 0 20px 32px; } .statistics-grid .card { padding: 16px 0; } .statistics-grid { gap: 0; } }
.model-share { display: grid; grid-template-columns: minmax(120px, 180px) minmax(0, 1fr); gap: 16px; align-items: center; }
.model-share :deep(.usage-canvas) { height: 180px; }
.distribution-legend { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; font-size: 13px; }
.distribution-legend li { display: flex; align-items: center; gap: 8px; min-width: 0; }
.distribution-legend i { width: 8px; height: 8px; flex: none; border-radius: 2px; }
.distribution-legend span { min-width: 0; overflow-wrap: anywhere; }
.distribution-legend strong { font-weight: 500; margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
.statistics-detail h2 { font-size: 14px; margin-bottom: 12px; }
.statistics-detail h3 { font-size: 12px; color: var(--fg-muted); margin: 14px 0 8px; }
.statistics-detail .statistics-values { gap: 8px 20px; }
.statistics-detail .statistics-values > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.statistics-detail dt { font-size: 12px; }
.statistics-detail dd { margin: 0; font-size: 13px; letter-spacing: 0; white-space: nowrap; }
.storage-summary { display: flex; justify-content: space-between; font-size: 12px; color: var(--fg-muted); }
.storage-summary strong { color: var(--fg); font-size: 13px; font-weight: 500; }
.storage-legend { gap: 7px; font-size: 12px; }
.storage-legend span { flex: 1; }
.storage-legend small { color: var(--fg-muted); font-size: 11px; }
.storage-legend strong { margin-left: 0; min-width: 65px; text-align: right; }
@media (max-width: 899px) { .statistics-footer { grid-template-columns: 1fr; gap: 0; } }
@media (min-width: 900px) { .statistics-usage > .statistics-values { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 450px) { .statistics-detail .statistics-values { grid-template-columns: 1fr; } }
.storage-bar { display: flex; overflow: hidden; border-radius: 4px; height: 10px; background: var(--bg-raised); margin: 10px 0 12px; }
.storage-bar span { flex: none; }
@media (max-width: 450px) { .model-share { grid-template-columns: minmax(100px, 130px) minmax(0, 1fr); gap: 10px; } .model-share :deep(.usage-canvas) { height: 140px; } }
@media (max-width: 599px) {
  .statistics-page { padding-inline: 12px; }
  .statistics-toolbar { flex-wrap: wrap; gap: 6px; }
  .statistics-usage { padding: 16px 12px; }
  .model-share { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .model-share :deep(.usage-canvas) { height: 180px; }
  .statistics-table { white-space: normal; }
  .statistics-table thead { display: none; }
  .statistics-table tbody, .statistics-table tr { display: block; }
  .statistics-table tr { padding-block: 10px; border-bottom: 1px solid var(--line); }
  .statistics-table td { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border: 0; overflow-wrap: anywhere; text-align: right; }
  .statistics-table td::before { content: attr(data-label); flex: none; color: var(--fg-muted); }
}
</style>
