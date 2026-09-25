<script setup lang="ts">
import type { PieSlice } from './pieDistribution.ts';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ChartCanvas from './ChartCanvas.vue';
import { calendarLayout, calendarOptions, lineOptions, pieOptions, type ChartStyle, type PlotSeries, type HeatData } from './chartOptions.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { theme } from '../../core/theme/index.ts';
import { i18n } from '../../core/i18n/index.ts';
const props = defineProps<{ pie?: PieSlice[]; series?: PlotSeries[]; heat?: HeatData; unit?: string; label: string; refreshing?: boolean }>();
const emit = defineEmits<{ columns: [value: number]; hover: [index: number | null] }>();
const root = ref<HTMLElement>();
const active = usePageActivity();
const style = ref<ChartStyle>();
let calendarObserver: ResizeObserver | undefined;
// The heatmap must not paint using a guessed width while its card is entering
// the layout: that first oversized frame is visible before ResizeObserver runs.
const width = ref(0);
// The calendar bucket count derives from width; refetching only makes sense
// when that count actually changes, and resize bursts settle first.
const columns = computed(() => width.value > 0 ? Math.max(1, Math.floor((width.value - 4) / 18)) : 0);
let columnTimer: ReturnType<typeof setTimeout> | undefined;
watch(columns, value => {
  if (!props.heat || !value) return;
  clearTimeout(columnTimer);
  columnTimer = setTimeout(() => emit('columns', value), 200);
});
function readStyle() {
  if (!active.value || !root.value?.isConnected) return;
  const css = getComputedStyle(root.value);
  const value = (name: string) => css.getPropertyValue(name).trim();
  style.value = { foreground: value('--fg'), muted: value('--fg-subtle'), line: value('--line'), surface: value('--bg-raised'), font: value('--font'),
    colors: [1,2,3,4,5,6].map(index => value(`--chart-${index}`)), heat: [0,1,2,3,4].map(index => value(`--heat-${index}`)) };
}
function measureCalendar() {
  const measured = root.value?.clientWidth ?? 0;
  if (measured > 0 && measured !== width.value) width.value = measured;
}
onMounted(async () => {
  readStyle();
  await nextTick();
  if (props.heat && root.value) {
    calendarObserver = new ResizeObserver(measureCalendar);
    calendarObserver.observe(root.value);
    measureCalendar();
  }
});
onBeforeUnmount(() => { calendarObserver?.disconnect(); clearTimeout(columnTimer); });
watch([theme.resolved, active], async () => { await nextTick(); readStyle(); if (props.heat) measureCalendar(); });
const layout = computed(() => props.heat && width.value > 0 ? calendarLayout(props.heat.buckets.length, width.value) : undefined);
const option = computed(() => style.value && (!props.heat || width.value > 0) && (props.pie ? pieOptions(props.pie, style.value, i18n.locale.value) : props.heat
  ? calendarOptions(props.heat, style.value, i18n.locale.value, width.value)
  : lineOptions(props.series ?? [], style.value, i18n.locale.value, props.unit ?? 'Token/s')));
</script>
<template>
  <div ref="root" class="usage-plot" :class="{ 'usage-calendar': heat, refreshing }" :data-cell-size="layout?.cell" :data-rows="layout?.rows" :data-columns="layout?.columns">
    <ChartCanvas v-if="option" :option="option" :label="label" @hover="emit('hover', $event)" :style="layout ? { height: `${layout.canvasHeight}px` } : undefined" />
  </div>
</template>
<style scoped>
.usage-plot { min-width: 0; transition: opacity .18s ease; }
.usage-plot.refreshing { opacity: .55; }
.usage-calendar { overflow: hidden; }
.usage-calendar :deep(.usage-canvas) { min-width: 0; }
</style>
