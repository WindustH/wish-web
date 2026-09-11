<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import UsageChartPanel from './UsageChartPanel.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity';
import { createUsageResource } from '../../core/usage/resource';
import { chartData } from '../../core/usage/normalize';
import { usageQueries, offsetLabel, type UsageRange } from '../../core/usage/windows';
import { usageDaily, usageSeries } from '../../core/api/endpoints.js';
import { cfg } from '../../core/config.js';
import type { SeriesQuery, DailyQuery } from '../../core/usage/types';
const props = defineProps<{ sessionId?: string }>();
const active = usePageActivity();
const range = ref<UsageRange>('day');
const timezone = ref(offsetLabel(-new Date().getTimezoneOffset()));
const series = createUsageResource((input: { sessionId?: string; query: SeriesQuery }, signal) => usageSeries(input.sessionId, input.query, { signal }));
const calendar = createUsageResource((input: { sessionId?: string; query: DailyQuery }, signal) => usageDaily(input.sessionId, input.query, { signal }));
const data = computed(() => series.data.value && chartData(series.data.value, timezone.value));
const days = computed(() => calendar.data.value?.days.map(day => [day.date, day.total_tokens] as [string, number]) ?? null);
let timer: ReturnType<typeof setInterval> | undefined;
let calendarReadAt = 0;
function readSeries(clear = false) {
  return series.load({ sessionId: props.sessionId, query: usageQueries(range.value).series }, clear);
}
function readCalendar(clear = false) {
  const now = Date.now();
  const query = usageQueries(range.value, now);
  timezone.value = query.timezone;
  calendarReadAt = now;
  return calendar.load({ sessionId: props.sessionId, query: query.daily }, clear);
}
function refresh() { if (active.value) { void readSeries(); void readCalendar(); } }
function stop() { clearInterval(timer); timer = undefined; series.cancel(); calendar.cancel(); }
function start() {
  stop(); refresh();
  timer = setInterval(() => {
    if (!series.loading.value) void readSeries();
    if (!calendar.loading.value && Date.now() - calendarReadAt >= cfg.stats.calendarRefreshMs) void readCalendar();
  }, cfg.stats.refreshMs);
}
function changeRange(value: string) { if (value === 'day' || value === 'week') range.value = value; }
watch(range, () => { if (active.value) void readSeries(true); });
watch(() => props.sessionId, () => { series.reset(); calendar.reset(); if (active.value) { void readSeries(true); void readCalendar(true); } });
watch(active, value => value ? start() : stop(), { immediate: true });
onScopeDispose(stop);
defineExpose({ refresh });
</script>
<template>
  <UsageChartPanel :data="data" :days="days" :loading="series.loading.value" :calendar-loading="calendar.loading.value"
    :error="series.error.value" :calendar-error="calendar.error.value" :range="range"
    @range="changeRange" @refresh="refresh" @retry-calendar="readCalendar()" />
</template>
