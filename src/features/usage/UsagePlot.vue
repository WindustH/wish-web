<script setup lang="ts">
import type { PieSlice } from './pieDistribution';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ChartCanvas from './ChartCanvas.vue';
import { calendarLayout, calendarOptions, lineOptions, pieOptions, type ChartStyle, type PlotSeries, type HeatData } from './chartOptions';
import { usePageActivity } from '../../ui/composables/usePageActivity';
import { theme } from '../../core/theme/index.js';
import { i18n } from '../../core/i18n/index.js';
const props = defineProps<{ pie?: PieSlice[]; series?: PlotSeries[]; heat?: HeatData; unit?: string; label: string }>();
const emit = defineEmits<{ columns: [value: number] }>();
const root = ref<HTMLElement>();
const active = usePageActivity();
const style = ref<ChartStyle>();
let calendarObserver: ResizeObserver | undefined;
const width = ref(800);
watch(width, value => { if (props.heat) emit('columns', Math.max(1, Math.floor((value - 4) / 18))); });
function readStyle() {
  if (!active.value || !root.value?.isConnected) return;
  const css = getComputedStyle(root.value);
  const value = (name: string) => css.getPropertyValue(name).trim();
  style.value = { foreground: value('--fg'), muted: value('--fg-subtle'), line: value('--line'), surface: value('--bg-raised'), font: value('--font'),
    colors: [1,2,3,4,5,6].map(index => value(`--chart-${index}`)), heat: [0,1,2,3,4].map(index => value(`--heat-${index}`)) };
}
onMounted(async () => {
  readStyle();
  await nextTick();
  if (props.heat && root.value) {
    calendarObserver = new ResizeObserver(() => { width.value = root.value!.clientWidth; });
    calendarObserver.observe(root.value);
  }
});
onBeforeUnmount(() => calendarObserver?.disconnect());
watch([theme.resolved, active], async () => { await nextTick(); readStyle(); });
const layout = computed(() => props.heat ? calendarLayout(props.heat.buckets.length, width.value) : undefined);
const option = computed(() => style.value && (props.pie ? pieOptions(props.pie, style.value, i18n.locale.value) : props.heat
  ? calendarOptions(props.heat, style.value, i18n.locale.value, width.value)
  : lineOptions(props.series ?? [], style.value, i18n.locale.value, props.unit ?? 'Token/s')));
</script>
<template>
  <div ref="root" class="usage-plot" :class="{ 'usage-calendar': heat }" :data-cell-size="layout?.cell" :data-rows="layout?.rows" :data-columns="layout?.columns">
    <ChartCanvas v-if="option" :option="option" :label="label" :style="layout ? { height: `${layout.canvasHeight}px` } : undefined" />
  </div>
</template>
<style scoped>
.usage-plot { min-width: 0; }
.usage-calendar { overflow: hidden; }
.usage-calendar :deep(.usage-canvas) { min-width: 0; }
</style>
