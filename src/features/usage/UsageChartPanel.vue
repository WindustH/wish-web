<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UsagePlot from './UsagePlot.vue';
import InfoHint from '../../ui/components/InfoHint.vue';
import { RefreshCw } from '@lucide/vue';
import { i18n } from '../../core/i18n/index.js';
import { cfg } from '../../core/config.js';
import { fmtTokens } from '../../core/util/fmt.js';
import type { UsageChartData } from '../../core/usage/types';
const props = defineProps<{ data: UsageChartData | null; days: [string, number][] | null; loading: boolean; calendarLoading: boolean; error: string; calendarError: string; range: string }>();
const emit = defineEmits<{ range: [value: string]; refresh: []; retryCalendar: [] }>();
const metric = ref<'tps' | 'tokens'>('tps');
const hidden = ref(new Set<string>());
const table = ref(false);
const dailyTable = ref(false);
const tablePage = ref(0);
const pageSize = cfg.stats.tablePageSize;
const tx = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;
const num = (value: number) => new Intl.NumberFormat(i18n.locale.value, { maximumFractionDigits: 2 }).format(value);
const keyOf = (provider: string | null, model: string | null) => JSON.stringify([provider, model]);
const models = computed(() => (props.data?.models ?? []).map((model, index) => ({ ...model, key: keyOf(model.provider, model.model), color: `var(--chart-${index % 6 + 1})`, label: `${model.model ?? 'Unknown model'} · ${model.provider ?? 'Unknown provider'}` })));
const series = computed(() => models.value.filter(model => !hidden.value.has(model.key)).map(model => ({ key: model.key, label: model.label, colorIndex: models.value.indexOf(model), points: model.points.map(point => [point.at, metric.value === 'tps' ? point.tps : point.tokens] as [number, number | null]) })));
const hasPoints = computed(() => series.value.some(model => model.points.some(point => point[1] !== null && (metric.value === 'tps' || point[1] > 0))));
const tableRows = computed(() => models.value.filter(model => !hidden.value.has(model.key)).flatMap(model => model.points.filter(point => point.attempts > 0).map(point => ({ ...point, key: model.key + ':' + point.at, label: model.label }))));
const pageCount = computed(() => Math.max(1, Math.ceil(tableRows.value.length / pageSize)));
const currentPage = computed(() => Math.min(tablePage.value, pageCount.value - 1));
const visibleRows = computed(() => tableRows.value.slice(currentPage.value * pageSize, (currentPage.value + 1) * pageSize));
watch([hidden, () => props.range], () => { tablePage.value = 0; });
const dailyTotal = computed(() => props.days?.reduce((total, day) => total + day[1], 0) ?? 0);
const activeDays = computed(() => props.days?.filter(day => day[1] > 0).length ?? 0);
function toggle(key: string) { const next = new Set(hidden.value); next.has(key) ? next.delete(key) : next.add(key); hidden.value = next; }
</script>
<template>
  <div class="usage-charts">
    <section class="usage-chart-card">
      <header class="usage-chart-header">
        <div class="usage-metrics" :aria-label="tx('统计指标', 'Metric')">
          <button class="btn ghost sm" :aria-pressed="metric === 'tps'" @click="metric = 'tps'">{{ tx('输出速度', 'Output speed') }}</button>
          <button class="btn ghost sm" :aria-pressed="metric === 'tokens'" @click="metric = 'tokens'">{{ tx('Token 消耗', 'Token usage') }}</button>
          <InfoHint :label="tx('计算方式', 'Calculation')" :text="tx('TPS = 输出 Token ÷ 首个至最后一个流式输出片段的时间。仅计入成功且有完整采样的调用，不包含首个输出前的等待、工具执行或其他 agent loop 环节。', 'TPS = output tokens / time from the first to the last streamed output delta. Only successful, timed calls count; time to first output, tools and other agent-loop work are excluded.')" />
        </div>
        <div class="usage-range" :aria-label="tx('时间范围', 'Time range')">
          <button v-for="period in [['day', tx('过去一天', 'Past day')], ['week', tx('过去一周', 'Past week')]]" :key="period[0]" class="btn ghost sm" :aria-pressed="range === period[0]" @click="emit('range', period[0]!)">{{ period[1] }}</button>
          <button class="btn ghost icon-only sm" :disabled="loading" :aria-label="i18n.t('stats.refresh')" @click="emit('refresh')"><RefreshCw :size="15" :class="{ spinning: loading }" /></button>
        </div>
      </header>
      <div v-if="error" class="load-error" role="alert">{{ error }} <button class="btn ghost sm" @click="emit('refresh')">{{ i18n.t('common.retry') }}</button></div>
      <div v-if="loading && !data" class="usage-empty" role="status">{{ tx('正在读取用量…', 'Loading usage…') }}</div>
      <template v-if="data">
        <div v-if="models.length" class="usage-models" :aria-label="tx('模型筛选', 'Model filter')">
          <button v-for="model in models" :key="model.key" class="usage-model" :aria-pressed="!hidden.has(model.key)" @click="toggle(model.key)">
            <span class="usage-dot" :style="{ background: model.color }" /><span class="usage-model-name">{{ model.model ?? 'Unknown model' }}<small>{{ model.provider ?? 'Unknown provider' }}</small></span>
            <strong>{{ metric === 'tokens' ? fmtTokens(model.tokens) : model.tps == null ? '—' : num(model.tps) }}<small>{{ metric === 'tokens' ? 'Token' : 'Token/s' }}</small></strong>
          </button>
        </div>
        <UsagePlot v-if="hasPoints" :series="series" :unit="metric === 'tps' ? 'Token/s' : 'Token'" :label="tx('分模型用量曲线；下方可展开数据表。', 'Usage by model; a data table is available below.')" />
        <div v-else class="usage-empty">{{ !series.length && models.length ? tx('请选择要显示的模型。', 'Select a model to display.') : metric === 'tps' ? tx('这段时间还没有有效的 TPS 采样。', 'No valid TPS samples in this period.') : tx('这段时间没有用量记录。', 'No usage recorded in this period.') }}</div>
        <footer class="usage-chart-meta">
          <span>{{ metric === 'tps' ? tx(`${num(data.samples)} 次有效采样 / ${num(data.attempts)} 条用量记录`, `${num(data.samples)} timed samples / ${num(data.attempts)} usage records`) : tx('包含失败请求已报告的用量', 'Includes reported usage from failed requests') }}</span>
          <button v-if="models.length" class="btn ghost sm" :aria-expanded="table" @click="table = !table">{{ tx('数据表', 'Data table') }}</button>
        </footer>
        <div v-if="table" class="usage-data-table"><table class="table"><thead><tr><th>{{ tx('时间', 'Time') }}</th><th>{{ tx('模型', 'Model') }}</th><th>Token</th><th>Token/s</th></tr></thead><tbody>
          <tr v-for="point in visibleRows" :key="point.key"><td>{{ new Date(point.at).toLocaleString(i18n.locale.value) }}</td><td>{{ point.label }}</td><td>{{ num(point.tokens) }}</td><td>{{ point.tps == null ? '—' : num(point.tps) }}</td></tr>
        </tbody></table></div>
        <div v-if="table && pageCount > 1" class="usage-chart-meta"><button class="btn ghost sm" :disabled="currentPage === 0" @click="tablePage = currentPage - 1">{{ tx('上一页', 'Previous') }}</button><span>{{ currentPage + 1 }} / {{ pageCount }}</span><button class="btn ghost sm" :disabled="currentPage + 1 >= pageCount" @click="tablePage = currentPage + 1">{{ tx('下一页', 'Next') }}</button></div>
      </template>
    </section>
    <section class="usage-chart-card">
      <header class="usage-chart-header"><h3>{{ tx('每日 Token 消耗', 'Daily token usage') }}</h3><span class="usage-calendar-period">{{ tx('过去一年', 'Past year') }}</span></header>
      <div v-if="calendarError" class="load-error" role="alert">{{ calendarError }}<button class="btn ghost sm" @click="emit('retryCalendar')">{{ i18n.t('common.retry') }}</button></div>
      <div v-if="calendarLoading && !days" class="usage-empty" role="status">{{ tx('正在读取用量…', 'Loading usage…') }}</div>
      <template v-if="days">
        <p class="usage-calendar-summary"><strong>{{ fmtTokens(dailyTotal) }}</strong> Token <span>· {{ tx(`${activeDays} 天有用量记录`, `${activeDays} days with usage`) }}</span></p>
        <UsagePlot :days="days" :label="tx(`过去一年共消耗 ${num(dailyTotal)} Token，${activeDays} 天有用量记录。`, `${num(dailyTotal)} tokens over ${activeDays} active days in the past year.`)" />
        <footer class="usage-chart-meta"><span>{{ data?.timezone }}</span><button class="btn ghost sm" :aria-expanded="dailyTable" @click="dailyTable = !dailyTable">{{ tx('每日数据', 'Daily data') }}</button><div class="usage-heat-legend"><span>{{ tx('少', 'Less') }}</span><i v-for="index in [0,1,2,3,4]" :key="index" :style="{ background: `var(--heat-${index})` }" /><span>{{ tx('多', 'More') }}</span></div></footer>
        <div v-if="dailyTable" class="usage-data-table"><table class="table"><thead><tr><th>{{ tx('日期', 'Date') }}</th><th>Token</th></tr></thead><tbody><tr v-for="day in [...days].reverse()" :key="day[0]"><td>{{ day[0] }}</td><td>{{ num(day[1]) }}</td></tr></tbody></table></div>
      </template>
    </section>
  </div>
</template>
<style scoped>
.usage-charts { display: grid; gap: 18px; min-width: 0; margin-block: 12px 24px; }
.usage-chart-card { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); }
.usage-chart-header { display: flex; justify-content: space-between; align-items: center; gap: 8px 16px; flex-wrap: wrap; margin-bottom: 12px; }
.usage-chart-header h3 { margin: 0; font: 600 14px/1.5 var(--font); }
.usage-metrics, .usage-range { display: flex; align-items: center; gap: 2px; }
.usage-metrics .btn, .usage-range .btn { white-space: nowrap; }
.btn[aria-pressed='true'] { background: var(--bg-active); color: var(--fg); }
.usage-models { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 8px; }
.usage-model { display: flex; align-items: center; gap: 7px; padding: 7px 8px; background: transparent; border: 1px solid transparent; border-radius: 6px; color: var(--fg); text-align: left; }
.usage-model:hover { background: var(--bg-hover); }
.usage-model:focus-visible { outline: none; border-color: var(--accent); }
.usage-model[aria-pressed='false'] { opacity: .45; }
.usage-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.usage-model-name { font-size: 12px; overflow-wrap: anywhere; }
.usage-model small { display: block; font-size: 10px; font-weight: 400; color: var(--fg-subtle); }
.usage-model strong { margin-left: 7px; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.load-error { padding: 10px 12px; margin-block: 8px; border: 1px solid var(--err-border); border-radius: 6px; background: var(--err-bg); color: var(--err); font-size: 12px; overflow-wrap: anywhere; }
.usage-empty { min-height: 160px; display: grid; place-items: center; text-align: center; color: var(--fg-subtle); font-size: 13px; }
.usage-chart-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 8px; color: var(--fg-subtle); font-size: 11px; }
.usage-calendar-summary { margin: 4px 0 12px; font-size: 12px; color: var(--fg-subtle); }
.usage-calendar-summary strong { font-size: 21px; color: var(--fg); font-weight: 600; }
.usage-calendar-period { font-size: 12px; color: var(--fg-subtle); }
.usage-heat-legend { display: flex; align-items: center; gap: 4px; }
.usage-heat-legend i { width: 11px; height: 11px; border-radius: 2px; }
.usage-data-table { max-height: 320px; overflow: auto; font-size: 12px; }
.usage-data-table table { width: 100%; white-space: nowrap; }
@media (max-width: 599px) { .usage-chart-card { padding: 12px; } .usage-chart-header { gap: 8px; } .usage-chart-meta { font-size: 10px; } }
</style>
