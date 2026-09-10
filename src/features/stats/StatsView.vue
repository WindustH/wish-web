<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { RefreshCw } from '@lucide/vue';
import { stats } from '../../core/state/statsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtDateTime, fmtTokens, fmtUptime } from '../../core/util/fmt.js';
import Spinner from '../../ui/components/Spinner.vue';

const { status, usage, storage, version, loading, error, updatedAt } = stats;
const totals = computed(() => usage.value?.statistics.totals);
const rows = computed(() => usage.value?.statistics.by_provider_model ?? []);
const errorMessage = computed(() => error.value instanceof Error ? error.value.message : String(error.value));
const tx = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;
const number = (value: number) => new Intl.NumberFormat(i18n.locale.value).format(value);
const percent = (value: number | null) => value == null ? '—' : new Intl.NumberFormat(i18n.locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(value);
onMounted(stats.startAuto);
onUnmounted(stats.stopAuto);
</script>

<template>
  <div class="page statistics-page">
    <div class="page-head publication-head"><div><span class="eyebrow">Wish / {{ tx('运行概况', 'Activity') }}</span><h1>{{ i18n.t('stats.title') }}</h1></div><button class="btn ghost" :disabled="loading" @click="stats.refresh"><RefreshCw :size="17" />{{ i18n.t('stats.refresh') }}</button></div>
    <div class="statistics-body">
      <p v-if="error" class="load-error" role="alert">{{ errorMessage }}<span v-if="updatedAt">{{ tx('下方保留上次成功读取的数据。', 'The last successful snapshot remains below.') }}</span></p>
      <Spinner v-if="loading && !updatedAt" />
      <div class="statistics-grid">
        <section v-if="status" class="card">
          <h2>{{ i18n.t('stats.overview') }}</h2>
          <dl class="statistics-values">
            <div><dt>{{ i18n.t('stats.sessions') }}</dt><dd>{{ number(status.counts.sessions) }}</dd></div>
            <div><dt>{{ i18n.t('stats.runs') }}</dt><dd>{{ number(status.counts.runs) }}</dd></div>
            <div><dt>{{ i18n.t('stats.uptime') }}</dt><dd>{{ fmtUptime(status.uptime_ms) }}</dd></div>
            <div><dt>{{ tx('会话服务版本', 'Session service version') }}</dt><dd>{{ version?.version }}</dd></div>
          </dl>
          <h3>{{ i18n.t('stats.queue') }}</h3>
          <dl class="statistics-values">
            <div><dt>{{ tx('正在运行', 'Running') }}</dt><dd>{{ number(status.queue.active_sessions) }}</dd></div>
            <div><dt>{{ tx('等待调度', 'Ready to run') }}</dt><dd>{{ number(status.queue.ready_sessions) }}</dd></div>
            <div><dt>{{ tx('待处理消息', 'Pending messages') }}</dt><dd>{{ number(status.queue.pending_items) }}</dd></div>
            <div><dt>{{ tx('正在压缩上下文', 'Compacting context') }}</dt><dd>{{ number(status.queue.compacting_sessions) }}</dd></div>
          </dl>
        </section>
        <section v-if="totals && usage" class="card statistics-usage">
          <h2>{{ i18n.t('stats.usage') }}</h2>
          <dl class="statistics-values">
            <div><dt>{{ i18n.t('stats.tokensIn') }}</dt><dd data-stat="input" :title="number(totals.tokens.input_tokens)">{{ fmtTokens(totals.tokens.input_tokens) }}</dd></div>
            <div><dt>{{ i18n.t('stats.tokensOut') }}</dt><dd data-stat="output" :title="number(totals.tokens.output_tokens)">{{ fmtTokens(totals.tokens.output_tokens) }}</dd></div>
            <div><dt>{{ i18n.t('stats.tokensTotal') }}</dt><dd data-stat="total" :title="number(totals.tokens.total_tokens)">{{ fmtTokens(totals.tokens.total_tokens) }}</dd></div>
            <div><dt>{{ i18n.t('stats.cacheHit') }}</dt><dd>{{ percent(totals.cache.request_hit_ratio) }}</dd></div>
            <div><dt>{{ i18n.t('stats.attempts') }}</dt><dd>{{ number(usage.statistics.model_attempts) }}</dd></div>
            <div><dt>{{ tx('已完成回复', 'Completed responses') }}</dt><dd>{{ number(totals.committed_responses) }}</dd></div>
          </dl>
          <p v-if="usage.statistics.attempts_without_usage" class="hint">{{ tx(`其中 ${number(usage.statistics.attempts_without_usage)} 次调用未返回用量。`, `${number(usage.statistics.attempts_without_usage)} attempts did not report usage.`) }}</p>
          <h3>{{ i18n.t('stats.byModel') }}</h3>
          <div class="statistics-table-wrap"><table class="table statistics-table">
            <thead><tr><th>{{ tx('提供方', 'Provider') }}</th><th>{{ tx('模型', 'Model') }}</th><th>{{ i18n.t('stats.tokensIn') }}</th><th>{{ i18n.t('stats.tokensOut') }}</th><th>{{ i18n.t('stats.tokensTotal') }}</th></tr></thead>
            <tbody><tr v-for="row in rows" :key="JSON.stringify([row.provider, row.model])">
              <td>{{ row.provider ?? tx('未记录', 'Not recorded') }}</td><td>{{ row.model ?? tx('未记录', 'Not recorded') }}</td>
              <td>{{ fmtTokens(row.totals.tokens.input_tokens) }}</td><td>{{ fmtTokens(row.totals.tokens.output_tokens) }}</td><td>{{ fmtTokens(row.totals.tokens.total_tokens) }}</td>
            </tr><tr v-if="!rows.length"><td colspan="5" class="hint">{{ tx('还没有用量记录。', 'No usage records yet.') }}</td></tr></tbody>
          </table></div>
        </section>
        <section v-if="storage" class="card">
          <h2>{{ i18n.t('stats.storage') }}</h2>
          <dl class="statistics-values">
            <div><dt>{{ tx('执行记录', 'Execution records') }}</dt><dd>{{ number(storage.counts.executions) }}</dd></div>
            <div><dt>{{ tx('资源文件', 'Resource files') }}</dt><dd>{{ number(storage.counts.blobs) }}</dd></div>
            <div><dt>{{ tx('图片任务', 'Image tasks') }}</dt><dd>{{ number(storage.counts.image_jobs) }}</dd></div>
            <div><dt>{{ tx('上下文版本', 'Context generations') }}</dt><dd>{{ number(storage.counts.context_generations) }}</dd></div>
          </dl>
        </section>
      </div>
      <p v-if="updatedAt" class="hint statistics-updated">{{ tx('更新于', 'Updated at') }} {{ fmtDateTime(updatedAt) }}</p>
    </div>
  </div>
</template>

<style scoped>
.statistics-page { padding: 0 clamp(24px, 5vw, 72px) 48px; }
.statistics-page > * { width: 100%; max-width: 1100px; margin-inline: auto; }
.statistics-body { padding: 0; }
.publication-head { justify-content: space-between; }
.statistics-grid { display: grid; gap: 32px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 450px), 1fr)); align-items: start; }
.statistics-grid .card { padding: 28px; min-width: 0; border-radius: 0; border: 0; border-top: 1px solid var(--line-strong); background: transparent; }
h2 { font: 600 22px/1.5 var(--display); margin: 0 0 28px; }
h3 { font-size: 14px; margin: 24px 0 16px; font-weight: 500; }
.statistics-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; margin: 0; }
dt { color: var(--fg-muted); font-size: 13px; }
dd { margin: 5px 0 0; font-size: 28px; font-weight: 400; letter-spacing: -.03em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.statistics-table-wrap { overflow-x: auto; }
.statistics-table { width: 100%; white-space: nowrap; }
.statistics-updated { margin-top: 18px; }
.load-error { margin-bottom: 20px; }
@media (max-width: 899px) { .statistics-page { padding: 0 20px 32px; } .statistics-grid .card { padding: 24px 0; } .statistics-grid { gap: 0; } }
</style>
