<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { modelColorKey } from './modelColors';
import UsageRangePicker from './UsageRangePicker.vue';
import type { RangeSelection } from '../../core/usage/windows';
import UsagePlot from './UsagePlot.vue';
import type { HeatData } from './chartOptions';
import InfoHint from '../../ui/components/InfoHint.vue';
import { i18n } from '../../core/i18n/index.js';
import { fmtTokens } from '../../core/util/fmt.js';
import type { UsageChartData } from '../../core/usage/types';
import { modelLabel } from '../../ui/modelLabel';
import { useProviderTitles } from '../../ui/composables/useProviderTitles';
const props = defineProps<{ data: UsageChartData | null; heat: HeatData | null; days: [string, number][] | null; loading: boolean; calendarLoading: boolean; error: string; calendarError: string; range: RangeSelection; calendarRange: RangeSelection; rangeSwitching?: boolean; calendarSwitching?: boolean }>();
const emit = defineEmits<{ range: [value: RangeSelection]; calendarRange: [value: RangeSelection]; refresh: []; retryCalendar: []; calendarColumns: [value: number] }>();
const metric = ref<'tps' | 'tokens'>('tps');
const hiddenModels = ref(new Set<string>());
function toggleModel(key:string){const next=new Set(hiddenModels.value);next.has(key)?next.delete(key):next.add(key);hiddenModels.value=next;}
const dailyTable = ref(false);
const tx = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;
const num = (value: number) => new Intl.NumberFormat(i18n.locale.value, { maximumFractionDigits: 2 }).format(value);
const keyOf = (provider: string | null, model: string | null) => JSON.stringify([provider, model]);
const providerTitle = useProviderTitles();
// The stats page assigns each model one color; this panel follows it when present.
const pageColor = inject(modelColorKey, null);
const models = computed(() => (props.data?.models ?? []).map((model, index) => ({ ...model, key: keyOf(model.provider, model.model), colorIndex: pageColor?.(keyOf(model.provider, model.model)) ?? index, color: `var(--chart-${(pageColor?.(keyOf(model.provider, model.model)) ?? index) % 6 + 1})`, modelName: model.model ? modelLabel(model.model) : 'Unknown model', providerName: model.provider ? providerTitle(model.provider) : 'Unknown provider' })).map(model => ({ ...model, label: `${model.modelName} · ${model.providerName}` })));
const series = computed(() => models.value.filter(model=>!hiddenModels.value.has(model.key)).map(model => ({ key: model.key, label: model.label, colorIndex: model.colorIndex, scatter: metric.value === 'tps', points: metric.value === 'tps' ? model.samples.map(point => [point.at_ms, point.tps, point.duration_ms] as [number, number | null, number]) : model.points.map(point => [point.at, point.tokens] as [number, number | null]) })));
const hasPoints = computed(() => series.value.some(model => model.points.some(point => point[1] !== null && (metric.value === 'tps' || point[1] > 0))));
const dailyTotal = computed(() => props.days?.reduce((total, day) => total + day[1], 0) ?? 0);
const activeDays = computed(() => props.days?.filter(day => day[1] > 0).length ?? 0);
</script>
<template>
  <div class="usage-charts">
    <section class="usage-chart-card">
      <div v-if="calendarError" class="load-error" role="alert">{{ calendarError }}<button class="btn ghost sm" @click="emit('retryCalendar')">{{ i18n.t('common.retry') }}</button></div>
      <div v-if="calendarLoading && !days" class="usage-empty" role="status">{{ tx('正在读取用量…', 'Loading usage…') }}</div>
      <template v-if="days">
        <div class="usage-calendar-summary"><span><strong>{{ fmtTokens(dailyTotal) }}</strong> Token <span>· {{ tx(`${activeDays} 天有用量记录`, `${activeDays} days with usage`) }}</span></span><UsageRangePicker :model-value="calendarRange" @update:model-value="emit('calendarRange', $event)" /></div>
        <UsagePlot v-if="heat" :heat="heat" :refreshing="calendarSwitching" @columns="emit('calendarColumns', $event)" :label="tx(`所选日期共消耗 ${num(dailyTotal)} Token，${activeDays} 天有用量记录。`, `${num(dailyTotal)} tokens over ${activeDays} active days in the selected range.`)" />
        <footer class="usage-chart-meta usage-calendar-meta"><span class="usage-calendar-meta-info"><span>{{ data?.timezone }}</span><button class="btn ghost sm" :aria-expanded="dailyTable" @click="dailyTable = !dailyTable">{{ tx('每日数据', 'Daily data') }}</button></span><div class="usage-heat-legend"><span>{{ tx('少', 'Less') }}</span><i v-for="index in [0,1,2,3,4]" :key="index" :style="{ background: `var(--heat-${index})` }" /><span>{{ tx('多', 'More') }}</span></div></footer>
        <div v-if="dailyTable" class="usage-data-table"><table class="table"><thead><tr><th>{{ tx('日期', 'Date') }}</th><th>Token</th></tr></thead><tbody><tr v-for="day in [...days].reverse()" :key="day[0]"><td>{{ day[0] }}</td><td>{{ num(day[1]) }}</td></tr></tbody></table></div>
      </template>
      <UsageRangePicker v-if="!days" :model-value="calendarRange" @update:model-value="emit('calendarRange', $event)" />
    </section>
    <slot name="between" />
    <section class="usage-chart-card">
      <header class="usage-chart-header">
        <div class="usage-metrics" :aria-label="tx('统计指标', 'Metric')">
          <button class="btn ghost sm" :aria-pressed="metric === 'tps'" @click="metric = 'tps'">{{ tx('估算 TPS', 'Estimated TPS') }}</button>
          <button class="btn ghost sm" :aria-pressed="metric === 'tokens'" @click="metric = 'tokens'">{{ tx('Token 消耗', 'Token usage') }}</button>
          <InfoHint :label="tx('计算方式', 'Calculation')" :text="tx('每个流式请求每秒采样一次，按收到的正文、明文思考和工具参数的 UTF-8 字节数 ÷ 4 估算 Token，再除以实际采样时长。包含请求等待和停顿；结束或打断时保留不足一秒的末点。散点按当前时间范围内各模型的均值 ±2σ 逐轮过滤异常值，每轮重新计算，最多 8 轮，仅影响绘图，不改变汇总 TPS 或用量统计。', 'Each streaming request is sampled every second. Tokens are estimated as received UTF-8 bytes / 4 for text, plaintext reasoning and tool arguments, divided by the actual interval. Includes waiting and stalls, with a partial final interval on completion or interruption. Scatter points outside each model’s mean ±2σ in the selected range are iteratively hidden, recalculating after each pass (up to 8 passes). Aggregate TPS and usage are unchanged.')" />
        </div>
        <div class="usage-range">
          <UsageRangePicker :model-value="range" @update:model-value="emit('range', $event)" />
        </div>
      </header>
      <div v-if="error" class="load-error" role="alert">{{ error }} <button class="btn ghost sm" @click="emit('refresh')">{{ i18n.t('common.retry') }}</button></div>
      <div v-if="loading && !data" class="usage-empty" role="status">{{ tx('正在读取用量…', 'Loading usage…') }}</div>
      <template v-if="data">
        <div v-if="models.length" class="usage-models" :aria-label="tx('模型图例', 'Model legend')">
          <button v-for="model in models" :key="model.key" type="button" class="usage-model" :aria-pressed="!hiddenModels.has(model.key)" @click="toggleModel(model.key)">
            <span class="usage-dot" :style="{ background: model.color }" /><span class="usage-model-name">{{ model.modelName }}<small>{{ model.providerName }}</small></span>
            <strong>{{ metric === 'tokens' ? fmtTokens(model.tokens) : model.tps == null ? '—' : num(model.tps) }}<small>{{ metric === 'tokens' ? 'Token' : 'Token/s' }}</small></strong>
          </button>
        </div>
        <Transition name="usage-swap">
        <UsagePlot v-if="hasPoints" :series="series" :refreshing="rangeSwitching" :unit="metric === 'tps' ? 'Token/s' : 'Token'" :label="metric === 'tps' ? tx('每秒估算 TPS 散点图', 'Per-second estimated TPS scatter plot') : tx('分模型用量曲线', 'Usage by model')" />
        <div v-else class="usage-empty">{{ !series.length && models.length ? tx('请选择要显示的模型。', 'Select a model to display.') : metric === 'tps' ? tx('这段时间还没有有效的 TPS 采样。', 'No valid TPS samples in this period.') : tx('这段时间没有用量记录。', 'No usage recorded in this period.') }}</div>
        </Transition>
        <footer v-if="metric === 'tokens'" class="usage-chart-meta"><span>{{ tx('包含失败请求已报告的用量', 'Includes reported usage from failed requests') }}</span></footer>
      </template>
    </section>
  </div>
</template>
<style scoped>
.usage-charts { display: grid; gap: 18px; min-width: 0; margin-block: 12px 24px; }
.usage-chart-card { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); }
.usage-chart-header { display: flex; justify-content: space-between; align-items: center; gap: 8px 16px; flex-wrap: wrap; margin-bottom: 12px; }
.usage-chart-header h3 { margin: 0; font: 600 14px/1.5 var(--font); }
.usage-metrics, .usage-range { display: flex; align-items: center; gap: 2px; min-width: 0; max-width: 100%; }
.usage-range { flex-wrap: wrap; gap: 6px; }
.usage-metrics .btn, .usage-range .btn { white-space: nowrap; }
.btn[aria-pressed='true'] { background: var(--bg-active); color: var(--fg); }
/* Equal cells line the figures up. */
.usage-models { display: grid; grid-template-columns: repeat(auto-fill, minmax(188px, 1fr)); gap: 2px 12px; margin-bottom: 8px; }
.usage-model { min-width: 0; width: 100%; display: flex; align-items: center; gap: 8px; padding: 7px 8px; background: transparent; border: 1px solid transparent; border-radius: 6px; color: var(--fg); text-align: left; }

.usage-model { cursor:pointer; }
@media (hover: hover) { .usage-model:hover { background:var(--bg-hover); } }
.usage-model[aria-pressed='false'] { opacity:.45; }
.usage-model:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }
.usage-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.usage-model-name { flex: 1; min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
.usage-model small { display: block; font-size: 10px; font-weight: 400; color: var(--fg-subtle); }
.usage-model strong { flex: none; margin-left: auto; padding-left: 6px; text-align: right; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
/* Phones: one compact row per model, provider and unit inline. */
@media (max-width: 599px) { .usage-models { grid-template-columns: minmax(0, 1fr); gap: 0; } .usage-model { padding: 6px; } .usage-model-name small, .usage-model strong small { display: inline; margin-left: 6px; } .usage-model strong { font-size: 15px; } }
.load-error { padding: 10px 12px; margin-block: 8px; border: 1px solid var(--err-border); border-radius: 6px; background: var(--err-bg); color: var(--err); font-size: 12px; overflow-wrap: anywhere; }
.usage-empty { min-height: 160px; display: grid; place-items: center; text-align: center; color: var(--fg-subtle); font-size: 13px; }
.usage-chart-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 8px; color: var(--fg-subtle); font-size: 11px; }
.usage-chart-meta.align-end { justify-content: flex-end; }
.usage-calendar-summary { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0 12px; font-size: 12px; color: var(--fg-subtle); }
.usage-calendar-summary > span:first-child { min-width: 0; }
.usage-calendar-summary :deep(.usage-range-picker) { margin-left: auto; }
.usage-calendar-summary strong { font-size: 21px; color: var(--fg); font-weight: 600; }
.usage-calendar-meta-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.usage-calendar-period { font-size: 12px; color: var(--fg-subtle); }
.usage-heat-legend { display: flex; align-items: center; gap: 4px; }
.usage-heat-legend i { width: 11px; height: 11px; border-radius: 2px; }
.usage-swap-enter-active, .usage-swap-leave-active { transition: opacity .15s ease; }
.usage-swap-enter-from, .usage-swap-leave-to { opacity: 0; }
.usage-data-table { max-height: 320px; overflow: auto; font-size: 12px; }
.usage-data-table table { width: 100%; white-space: nowrap; }
@media (max-width: 599px) { .usage-chart-card { padding: 12px; } .usage-chart-header { gap: 8px; } .usage-chart-meta { font-size: 10px; } }
</style>
