<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core';
import { LineChart, ScatterChart, HeatmapChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, CalendarComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
use([LineChart, ScatterChart, HeatmapChart, PieChart, GridComponent, TooltipComponent, CalendarComponent, VisualMapComponent, CanvasRenderer]);
const props = defineProps<{ option: EChartsCoreOption; label: string }>();
// The data index under the pointer (or tap), null when it leaves.
const emit = defineEmits<{ hover: [index: number | null] }>();
const host = ref<HTMLDivElement>();
const active = usePageActivity();
let chart: EChartsType | undefined;
let observer: ResizeObserver | undefined;
let frame = 0;
let mounted = false;
let appliedOption: EChartsCoreOption | undefined;
let width = 0, height = 0;
function draw() {
  if (!mounted || !active.value || !host.value?.clientWidth || !host.value?.clientHeight) return;
  if (!chart) {
    chart = init(host.value, undefined, { renderer: 'canvas' });
    chart.on('mouseover', (event: any) => emit('hover', event.dataIndex ?? null));
    chart.on('mouseout', () => emit('hover', null));
    chart.on('globalout', () => emit('hover', null));
  }
  const nextWidth = host.value.clientWidth, nextHeight = host.value.clientHeight;
  if (width !== nextWidth || height !== nextHeight) {
    chart.resize();
    width = nextWidth; height = nextHeight;
  }
  // Merge instead of a full replace: unchanged components (axes, grid,
  // stable-id series) transition in place with the update animation, and
  // series that left the selection are disposed. A notMerge swap would
  // tear the chart down and redraw everything from scratch on each change.
  if (appliedOption !== props.option) {
    chart.setOption(props.option, { replaceMerge: ['series'] });
    appliedOption = props.option;
  }
}
function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); }
function dispose() { cancelAnimationFrame(frame); chart?.dispose(); chart = undefined; appliedOption = undefined; width = 0; height = 0; }
onMounted(() => {
  mounted = true;
  observer = new ResizeObserver(schedule);
  observer.observe(host.value!);
  schedule();
});
watch(() => props.option, schedule);
watch(active, async value => { if (value) { await nextTick(); schedule(); } else dispose(); });
onBeforeUnmount(() => { mounted = false; observer?.disconnect(); dispose(); });
</script>
<template><div ref="host" class="usage-canvas" role="img" :aria-label="label" /></template>
<style scoped>.usage-canvas { width: 100%; height: 260px; min-width: 0; }</style>
