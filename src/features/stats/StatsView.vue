<script setup lang="ts">
import { pieDistribution } from '../usage/pieDistribution';
import Hint from '../../ui/components/Hint.vue';
import { computed, defineAsyncComponent, onActivated, onDeactivated, provide, ref } from 'vue';
import { modelColorKey } from '../usage/modelColors';
import { RefreshCw } from '@lucide/vue';
import { stats } from '../../core/state/statsSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { fmtBytes, fmtDateTime, fmtTokens, fmtUptime } from '../../core/util/fmt.js';
import Spinner from '../../ui/components/Spinner.vue';
import { modelLabel } from '../../ui/modelLabel';
import { useProviderTitles } from '../../ui/composables/useProviderTitles';

const UsagePlot = defineAsyncComponent(() => import('../usage/UsagePlot.vue'));
const UsageCharts = defineAsyncComponent(() => import('../usage/UsageCharts.vue'));
const charts = ref<{ refresh: () => void }>();
function refresh() { void stats.refresh(); charts.value?.refresh(); }
const { status, usage, storage, version, loading, error, updatedAt } = stats;
const hiddenModels = ref(new Set<string>());
function toggleModel(key:string){const next=new Set(hiddenModels.value);next.has(key)?next.delete(key):next.add(key);hiddenModels.value=next;}
const providerTitle = useProviderTitles();
const modelName = (model: string | null) => model ? modelLabel(model) : tx('未记录', 'Not recorded');
const providerLabel = (provider: string | null) => provider ? providerTitle(provider) : tx('未记录', 'Not recorded');
const modelKey = (row: {provider: string | null; model: string | null}) => JSON.stringify([row.provider,row.model]);
const rows = computed(() => usage.value?.statistics.by_provider_model ?? []);
// Charts below color models by their row here, matching the buttons and the donut.
provide(modelColorKey, key => { const index = rows.value.findIndex(row => modelKey(row) === key); return index < 0 ? undefined : index; });
const selectedRows = computed(() => rows.value.filter(row=>!hiddenModels.value.has(modelKey(row))));
const totals = computed(() => selectedRows.value.reduce((sum,row)=>{
  sum.tokens.input_tokens+=row.totals.tokens.input_tokens;
  sum.tokens.output_tokens+=row.totals.tokens.output_tokens;
  sum.cache.read_input_tokens+=row.totals.cache.read_input_tokens;
  return sum;
},{tokens:{input_tokens:0,output_tokens:0},cache:{read_input_tokens:0}}));
const totalTokens = computed(()=>usage.value?.statistics.totals.tokens.total_tokens??0);
const errorMessage = computed(() => error.value instanceof Error ? error.value.message : String(error.value));
const tx = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;
const number = (value: number) => new Intl.NumberFormat(i18n.locale.value).format(value);
const percent = (value: number | null) => value == null ? '—' : new Intl.NumberFormat(i18n.locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(value);
// Keep the button's original color index through filtering and pie sorting.
const models = computed(() => rows.value.flatMap((row, colorIndex) => {
  if (hiddenModels.value.has(modelKey(row))) return [];
  const label = modelName(row.model);
  const duplicate = rows.value.some(other => other !== row && other.model === row.model);
  return [{
    name: duplicate ? `${label} · ${providerLabel(row.provider)}` : label,
    value: row.totals.tokens.total_tokens,
    colorIndex,
  }];
}));
const slices = computed(() => pieDistribution(models.value, tx('其他', 'Other')));
const showPie = computed(() => models.value.filter(item => item.value > 0).length > 1);
const pieTotal = computed(() => models.value.reduce((sum, item) => sum + item.value, 0));
const queueRows = computed(() => status.value ? [
  { name: tx('运行中会话', 'Running sessions'), value: status.value.queue.active_sessions },
  { name: tx('待调度会话', 'Ready sessions'), value: status.value.queue.ready_sessions },
  { name: tx('待处理消息', 'Pending messages'), value: status.value.queue.pending_items },
  { name: tx('上下文压缩中会话', 'Compacting sessions'), value: status.value.queue.compacting_sessions },
] : []);
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
  <div class="page statistics-page" data-scroll-preserve>
    <div class="statistics-toolbar"><span v-if="updatedAt" class="hint">{{ tx('更新于', 'Updated at') }} {{ fmtDateTime(updatedAt) }}</span><Hint :text="i18n.t('stats.refresh')"><button class="btn ghost icon-only" :disabled="loading" :aria-label="i18n.t('stats.refresh')" @click="refresh"><RefreshCw :size="17" /></button></Hint></div>
    <div class="statistics-body">
      <p v-if="error" class="load-error" role="alert">{{ errorMessage }}<span v-if="updatedAt">{{ tx('下方保留上次成功读取的数据。', 'The last successful snapshot remains below.') }}</span></p>
      <Spinner v-if="loading && !updatedAt" />
      <UsageCharts ref="charts">
        <section v-if="totals && usage" class="card statistics-usage">
          <div class="statistics-models" role="group" :aria-label="tx('用量统计模型','Usage model')">
            <button v-for="(row,index) in rows" :key="modelKey(row)" class="statistics-model" :aria-pressed="!hiddenModels.has(modelKey(row))" @click="toggleModel(modelKey(row))">
              <i class="statistics-model-dot" :style="{background:color(index)}"/>
              <span>{{modelName(row.model)}}<small>{{providerLabel(row.provider)}}<em class="statistics-model-share-inline"> · {{percent(totalTokens>0?row.totals.tokens.total_tokens/totalTokens:0)}}</em></small></span>
              <small class="statistics-model-share">{{percent(totalTokens>0?row.totals.tokens.total_tokens/totalTokens:0)}}</small>
            </button>
          </div>
          <dl class="statistics-values">
            <div><dt>{{ i18n.t('stats.tokensIn') }} <small>Token</small></dt><Hint :text="number(totals.tokens.input_tokens)"><dd data-stat="input">{{ fmtTokens(totals.tokens.input_tokens) }}</dd></Hint></div>
            <div><dt>{{ i18n.t('stats.tokensOut') }} <small>Token</small></dt><Hint :text="number(totals.tokens.output_tokens)"><dd data-stat="output">{{ fmtTokens(totals.tokens.output_tokens) }}</dd></Hint></div>
            <div><dt>{{ tx('缓存命中', 'Cache read') }} <small>Token</small></dt><Hint :text="number(totals.cache.read_input_tokens)"><dd data-stat="cached">{{ fmtTokens(totals.cache.read_input_tokens) }}</dd></Hint></div>
            <div><dt>{{ tx('缓存命中率', 'Cache hit rate') }}</dt><dd>{{ percent(totals.tokens.input_tokens > 0 ? totals.cache.read_input_tokens / totals.tokens.input_tokens : null) }}</dd></div>
          </dl>
          <h3 v-if="showPie">{{ tx('模型 Token 占比', 'Token share by model') }}</h3>
          <div v-if="showPie" class="model-share">
            <div class="model-share-chart">
              <UsagePlot :pie="slices" :label="tx('各模型总 Token 消耗占比', 'Total Token consumption by model')" />
              <div class="model-share-total" aria-hidden="true"><strong>{{ fmtTokens(pieTotal) }}</strong><span>Token</span></div>
            </div>
            <ul class="distribution-legend">
              <li v-for="(item,index) in slices" :key="index"><i :style="{ background: item.colorIndex == null ? 'var(--fg-subtle)' : color(item.colorIndex) }" /><span>{{ item.name }}</span><strong>{{ percent(item.share) }}</strong></li>
            </ul>
          </div>
        </section>
      </UsageCharts>
      <div class="statistics-grid">
        <div class="statistics-footer">
        <section v-if="status" class="statistics-panel">
          <header class="panel-head">
            <h2>{{ tx('服务状态', 'Service status') }}</h2>
            <span v-if="version?.version" class="version-pill">wish {{ version.version }}</span>
            <span class="service-state" :class="{ busy: status.queue.active_sessions > 0 }"><i />{{ status.queue.active_sessions > 0 ? tx(`运行中 ${number(status.queue.active_sessions)}`, `${number(status.queue.active_sessions)} running`) : tx('空闲', 'Idle') }}</span>
          </header>
          <dl class="panel-hero">
            <div><dt>{{ tx('已保存会话', 'Stored sessions') }}</dt><dd>{{ number(status.counts.sessions) }}</dd></div>
            <div><dt>{{ tx('本次启动已运行', 'Uptime since startup') }}</dt><dd>{{ fmtUptime(status.uptime_ms) }}</dd></div>
          </dl>
          <h3>{{ i18n.t('stats.queue') }}</h3>
          <dl class="queue-grid">
            <div v-for="item in queueRows" :key="item.name" :class="{ active: item.value > 0 }"><dt>{{ item.name }}</dt><dd>{{ number(item.value) }}</dd></div>
          </dl>
        </section>
        <section v-if="storage" class="statistics-panel">
          <header class="panel-head"><h2>{{ i18n.t('stats.storage') }}</h2></header>
          <dl class="panel-hero">
            <div><dt>{{ tx('文件总大小', 'Total file size') }}</dt><dd><Hint :text="`${number(storage.bytes.total)} B`"><span>{{ fmtBytes(storage.bytes.total) }}</span></Hint></dd></div>
          </dl>
          <div class="storage-bar" role="img" :aria-label="storageRows.map(item => `${item.name}: ${fmtBytes(item.value)}`).join(', ')">
            <template v-for="(item,index) in storageRows" :key="item.name"><span v-if="item.value > 0" :style="{ flexGrow: item.value, background: color(index) }" /></template>
          </div>
          <ul class="storage-legend">
            <li v-for="(item,index) in storageRows" :key="index"><i :style="{ background: color(index) }" /><span>{{ item.name }}</span><small>{{ percent(storage.bytes.total ? item.value / storage.bytes.total : 0) }}</small><Hint :text="`${number(item.value)} B`"><strong>{{ fmtBytes(item.value) }}</strong></Hint></li>
          </ul>
        </section>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.statistics-page { padding: 0 clamp(24px, 4vw, 64px) 32px; }
.statistics-page > * { width: 100%; max-width: 1100px; margin-inline: auto; }
.statistics-body { padding: 0; min-width: 0; }
.statistics-usage { min-width: 0; }
/* Equal cells keep names, providers and shares aligned however many models there are. */
.statistics-models { display:grid; grid-template-columns:repeat(auto-fill, minmax(168px, 1fr)); gap:2px 12px; margin-bottom:16px; min-width:0; }
.statistics-model { display:flex; align-items:center; gap:8px; width:100%; min-width:0; padding:7px 8px; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--fg-subtle); font:inherit; font-size:12px; text-align:left; cursor:pointer; }
@media (hover: hover) { .statistics-model:hover { background:var(--bg-hover); } }
.statistics-model[aria-pressed='true'] { color:var(--fg); }
.statistics-model[aria-pressed='false'] { opacity:.45; }
.statistics-model .statistics-model-share { flex:none; margin-left:auto; padding-left:6px; white-space:nowrap; font-variant-numeric:tabular-nums; }
.statistics-model:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }
.statistics-model span { flex:1; min-width:0; overflow-wrap:anywhere; }
.statistics-model-share-inline { display:none; font-style:normal; font-variant-numeric:tabular-nums; }
/* Phones: the share joins the provider line so names keep the full cell width. */
@media (max-width:599px) { .statistics-models { grid-template-columns:repeat(2, minmax(0, 1fr)); gap:2px 6px; } .statistics-model { padding-inline:6px; } .statistics-model .statistics-model-share { display:none; } .statistics-model-share-inline { display:inline; } }
.statistics-model small { display:block; margin-top:2px; font-size:10px; color:var(--fg-subtle); }
.statistics-model-dot { width:7px; height:7px; border-radius:50%; flex:none; }
.statistics-toolbar { display: flex; flex: none; align-items: center; justify-content: end; gap: 12px; padding-block: 10px; }
.statistics-grid { display: grid; gap: 20px; min-width: 0; margin-top: 20px; }
.statistics-footer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; min-width: 0; }
h2 { font: 600 16px/1.5 var(--font); margin: 0 0 16px; }
h3 { font-size: 14px; margin: 16px 0 12px; font-weight: 500; }
.statistics-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; margin: 0; }
dt small { font-size: 12px; font-weight: 400; color: var(--fg-muted); letter-spacing: 0; }
dt { color: var(--fg-muted); font-size: 13px; }
dd { margin: 3px 0 0; font-size: 18px; font-weight: 500; letter-spacing: -.03em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.statistics-table-wrap { overflow-x: auto; }
.statistics-table { width: 100%; white-space: nowrap; }
.load-error { margin-bottom: 20px; }
@media (max-width: 899px) { .statistics-page { padding: 0 20px 32px; } }
.model-share { display: grid; grid-template-columns: minmax(120px, 180px) minmax(0, 1fr); gap: 16px; align-items: center; }
.model-share :deep(.usage-canvas) { height: 180px; }
.distribution-legend, .storage-legend { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.distribution-legend li, .storage-legend li { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 7px 0; }
.distribution-legend li + li, .storage-legend li + li { border-top: 1px solid var(--line); }
.distribution-legend i, .storage-legend i { width: 8px; height: 8px; flex: none; border-radius: 50%; }
.distribution-legend span, .storage-legend span { flex: 1; min-width: 0; color: var(--fg-muted); overflow-wrap: anywhere; }
.distribution-legend strong, .storage-legend strong { font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
.model-share-chart { position: relative; min-width: 0; }
.model-share-total { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; line-height: 1.2; }
.model-share-total strong { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.model-share-total span { font-size: 10px; color: var(--fg-subtle); }
/* Service status and storage: cards matching the chart cards above. */
.statistics-panel { min-width: 0; padding: 18px 20px 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); }
.panel-head { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 16px; }
.panel-head h2 { margin: 0; font: 600 14px/1.5 var(--font); }
.version-pill { padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--fg-subtle); font-size: 11px; line-height: 1.6; white-space: nowrap; font-variant-numeric: tabular-nums; }
.service-state { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; color: var(--fg-subtle); font-size: 12px; white-space: nowrap; }
.service-state i { width: 7px; height: 7px; border-radius: 50%; background: var(--fg-faint); }
.service-state.busy { color: var(--fg); }
.service-state.busy i { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.panel-hero { display: flex; flex-wrap: wrap; gap: 12px 40px; margin: 0; }
.panel-hero dt { color: var(--fg-subtle); font-size: 12px; }
.panel-hero dd { margin: 4px 0 0; font-size: 24px; font-weight: 600; line-height: 1.2; letter-spacing: -.02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.statistics-panel h3 { margin: 20px 0 10px; color: var(--fg-subtle); font-size: 12px; font-weight: 500; }
.queue-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; }
.queue-grid > div { display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 2px; min-width: 0; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--fg) 5%, transparent); }
.queue-grid dt { color: var(--fg-subtle); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.queue-grid dd { margin: 0; color: var(--fg-faint); font-size: 18px; font-weight: 600; line-height: 1.3; font-variant-numeric: tabular-nums; }
.queue-grid > .active dd { color: var(--accent); }
.queue-grid > .active dt { color: var(--fg-muted); }
.storage-bar { display: flex; gap: 2px; height: 10px; margin: 16px 0 10px; overflow: hidden; border-radius: 999px; background: var(--bg-sunken); }
.storage-bar span { flex: 0 1 0; min-width: 6px; }
.storage-legend small { min-width: 48px; color: var(--fg-subtle); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
.storage-legend strong { min-width: 72px; text-align: right; }
@media (max-width: 899px) { .statistics-footer { grid-template-columns: 1fr; gap: 16px; } .statistics-grid { margin-top: 16px; } .statistics-panel { padding: 16px; } }
@media (max-width: 599px) { .queue-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .panel-hero { gap: 12px 32px; } }
/* Two columns only once each card has room for its legends; narrower windows stack them. */
@media (min-width: 1100px) {
  .statistics-body :deep(.usage-charts) { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  .statistics-body :deep(.usage-chart-card:first-child) { grid-column: 1; grid-row: 1; }
  .statistics-body :deep(.usage-chart-card:last-child) { grid-column: 1; grid-row: 2; }
  .statistics-usage { grid-column: 2; grid-row: 1 / span 2; }
  .statistics-usage > .statistics-values { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .model-share { grid-template-columns: minmax(100px, 140px) minmax(0, 1fr); gap: 12px; }
  .model-share :deep(.usage-canvas) { height: 140px; }
  .statistics-table { white-space: normal; table-layout: fixed; }
  .statistics-table th, .statistics-table td { overflow-wrap: anywhere; padding-inline: 6px; }
}
@media (max-width: 450px) { .model-share { grid-template-columns: minmax(100px, 130px) minmax(0, 1fr); gap: 10px; } .model-share :deep(.usage-canvas) { height: 140px; } }
@media (max-width: 599px) {
  .statistics-page { padding-inline: 20px; }
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
