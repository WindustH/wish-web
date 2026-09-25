<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import UsageChartPanel from './UsageChartPanel.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { createUsageResource } from '../../core/usage/resource.ts';
import { chartData } from '../../core/usage/normalize.ts';
import { usageQueries, offsetLabel, type RangeSelection } from '../../core/usage/windows.ts';
import { usageDaily, usageSeries } from '../../core/api/endpoints.ts';
import { cfg } from '../../core/config.ts';
import type { SeriesQuery, DailyQuery } from '../../core/usage/types.ts';
const props = defineProps<{ sessionId?: string }>();
const active = usePageActivity();
const range = ref<RangeSelection>({period:'day'});
const rangeSwitching = ref(false);
const calendarSwitching = ref(false);
const calendarColumns = ref(44);
const calendarRange = ref<RangeSelection>({period:'year'});
const timezone = ref(offsetLabel(-new Date().getTimezoneOffset()));
// The last response per query opens instantly; per-session charts stay in memory only.
const cacheKey = (kind: string) => (input: { sessionId?: string; query: object }) => ({ key: `usage-${kind}:${input.sessionId ?? ''}:${JSON.stringify(input.query)}`, persist: !input.sessionId });
const series = createUsageResource((input: { sessionId?: string; query: SeriesQuery }, signal) => usageSeries(input.sessionId, input.query, { signal }), cacheKey('series'));
const calendar = createUsageResource((input: { sessionId?: string; query: DailyQuery }, signal) => usageDaily(input.sessionId, input.query, { signal }), cacheKey('daily'));
const data = computed(() => series.data.value && chartData(series.data.value, timezone.value));
const days = computed(() => calendar.data.value?.days.map(day => [day.date, day.total_tokens] as [string, number]) ?? null);
const heat = computed(() => calendar.data.value ? { buckets: calendar.data.value.buckets, bucketMs: calendar.data.value.query.bucket_ms, endMs: calendar.data.value.query.last_day_start_ms + 86400000, offsetMinutes: calendar.data.value.query.tz_offset_minutes } : null);
let timer: ReturnType<typeof setInterval> | undefined;
let calendarReadAt = 0;
function readSeries(clear = false) {
  return series.load({ sessionId: props.sessionId, query: usageQueries(range.value).series }, clear);
}
function readCalendar(clear = false) {
  const now = Date.now();
  const query = usageQueries(calendarRange.value, now);
  timezone.value = query.timezone;
  calendarReadAt = now;
  return calendar.load({ sessionId: props.sessionId, query: { ...query.daily, bucket_ms: Math.ceil((query.daily.days ?? 365) * 86400000 / (7 * calendarColumns.value)) } }, clear);
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
function changeRange(value: RangeSelection) { range.value = value; rangeSwitching.value = true; }
function changeCalendarRange(value: RangeSelection) { calendarRange.value = value; calendarSwitching.value = true; }
watch(calendarColumns, () => { if (active.value) void readCalendar(); });
// Range switches keep the previous data rendered until the new window arrives
// (stale-while-revalidate): clearing here would unmount the canvas and flash.
watch(calendarRange, () => { if (active.value) void readCalendar().finally(() => { if (!calendar.loading.value) calendarSwitching.value = false; }); });
watch(range, () => { if (active.value) void readSeries().finally(() => { if (!series.loading.value) rangeSwitching.value = false; }); });
watch(() => props.sessionId, () => { series.reset(); calendar.reset(); if (active.value) { void readSeries(true); void readCalendar(true); } });
watch(active, value => value ? start() : stop(), { immediate: true });
onScopeDispose(stop);
defineExpose({ refresh });
</script>
<template>
  <UsageChartPanel :data="data" :days="days" :heat="heat" :loading="series.loading.value" :calendar-loading="calendar.loading.value"
    :error="series.error.value" :calendar-error="calendar.error.value" :range="range" :calendar-range="calendarRange" :range-switching="rangeSwitching" :calendar-switching="calendarSwitching"
    @calendar-columns="calendarColumns = $event" @range="changeRange" @calendar-range="changeCalendarRange" @refresh="refresh" @retry-calendar="readCalendar()"><template #between><slot /></template></UsageChartPanel>
</template>
