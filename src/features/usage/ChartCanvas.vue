<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core';
import { LineChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, CalendarComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { usePageActivity } from '../../ui/composables/usePageActivity';
use([LineChart, HeatmapChart, GridComponent, TooltipComponent, CalendarComponent, VisualMapComponent, CanvasRenderer]);
const props = defineProps<{ option: EChartsCoreOption; label: string }>();
const host = ref<HTMLDivElement>();
const active = usePageActivity();
let chart: EChartsType | undefined;
let observer: ResizeObserver | undefined;
let frame = 0;
let mounted = false;
function draw() {
  if (!mounted || !active.value || !host.value?.clientWidth || !host.value?.clientHeight) return;
  chart ??= init(host.value, undefined, { renderer: 'canvas' });
  chart.resize();
  chart.setOption(props.option, { notMerge: true });
}
function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); }
function dispose() { cancelAnimationFrame(frame); chart?.dispose(); chart = undefined; }
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
