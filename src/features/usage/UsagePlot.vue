<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ChartCanvas from './ChartCanvas.vue';
import { calendarOptions, lineOptions, type ChartStyle, type PlotSeries } from './chartOptions';
import { theme } from '../../core/theme/index.js';
import { i18n } from '../../core/i18n/index.js';
const props = defineProps<{ series?: PlotSeries[]; days?: [string, number][]; unit?: string; label: string }>();
const root = ref<HTMLElement>();
const style = ref<ChartStyle>();
let calendarObserver: ResizeObserver | undefined;
let previousScrollMax = 0;
function readStyle() {
  if (!root.value) return;
  const css = getComputedStyle(root.value);
  const value = (name: string) => css.getPropertyValue(name).trim();
  style.value = { foreground: value('--fg'), muted: value('--fg-subtle'), line: value('--line'), surface: value('--bg-raised'), font: value('--font'),
    colors: [1,2,3,4,5,6].map(index => value(`--chart-${index}`)), heat: [0,1,2,3,4].map(index => value(`--heat-${index}`)) };
}
onMounted(async () => {
  readStyle();
  await nextTick();
  if (props.days && root.value) {
    calendarObserver = new ResizeObserver(() => {
      const el = root.value!;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= previousScrollMax - 2 || el.scrollLeft >= max - 2) el.scrollLeft = max;
      previousScrollMax = max;
    });
    calendarObserver.observe(root.value);
  }
});
onBeforeUnmount(() => calendarObserver?.disconnect());
watch(theme.resolved, async () => { await nextTick(); readStyle(); });
const option = computed(() => style.value && (props.days
  ? calendarOptions(props.days, style.value, i18n.locale.value)
  : lineOptions(props.series ?? [], style.value, i18n.locale.value, props.unit ?? 'Token/s')));
</script>
<template>
  <div ref="root" class="usage-plot" :class="{ 'usage-calendar': days }">
    <ChartCanvas v-if="option" :option="option" :label="label" />
  </div>
</template>
<style scoped>
.usage-plot { min-width: 0; }
.usage-calendar { overflow-x: auto; scrollbar-width: thin; }
.usage-calendar :deep(.usage-canvas) { height: 144px; min-width: 660px; }
</style>
