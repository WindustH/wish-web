<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { modelKey } from './modelColors.ts';
import UsageChartPanel from './UsageChartPanel.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { createCachedResource } from '../../core/util/cachedResource.ts';
import { chartData } from '../../core/usage/normalize.ts';
import {
  usageQueries,
  rangeBounds,
  offsetLabel,
  type RangeSelection,
  type TotalsRange,
} from '../../core/usage/windows.ts';
import { usageDaily, usageSeries } from '../../core/api/endpoints.ts';
import { cfg } from '../../core/config.ts';
import type { SeriesQuery, DailyQuery } from '../../core/usage/types.ts';
const props = defineProps<{ sessionId?: string; sharedRange?: TotalsRange; hiddenModels?: Set<string> }>();
const active = usePageActivity();
const localRange = ref<RangeSelection>({ period: 'week' });
const range = computed(() => props.sharedRange ?? localRange.value);
const rangeSwitching = ref(false);
const calendarSwitching = ref(false);
const calendarColumns = ref(44);
const calendarRange = ref<RangeSelection>({ period: props.sharedRange ? 'quarter' : 'week' });
const timezone = ref(offsetLabel(-new Date().getTimezoneOffset()));
// The last response per query opens instantly; per-session charts stay in memory only.
const cacheKey = (kind: string) => (input: { sessionId?: string; query: object }) => ({
  key: `usage-${kind}:${input.sessionId ?? ''}:${JSON.stringify(input.query)}`,
  persist: !input.sessionId,
});
const series = createCachedResource(
  (input: { sessionId?: string; query: SeriesQuery }, signal) => usageSeries(input.sessionId, input.query, { signal }),
  cacheKey('series'),
);
const calendar = createCachedResource(
  (input: { sessionId?: string; query: DailyQuery }, signal) => usageDaily(input.sessionId, input.query, { signal }),
  cacheKey('daily'),
);
const data = computed(() => series.data.value && chartData(series.data.value, timezone.value));
const speeds = computed(
  () => new Map(data.value?.models.map((model) => [modelKey(model.provider, model.model), model.tps])),
);
const days = computed(
  () => calendar.data.value?.days.map((day) => [day.date, day.total_tokens] as [string, number]) ?? null,
);
const heat = computed(() =>
  calendar.data.value
    ? {
        buckets: calendar.data.value.buckets,
        bucketMs: calendar.data.value.query.bucket_ms,
        endMs: calendar.data.value.query.last_day_start_ms + 86400000,
        offsetMinutes: calendar.data.value.query.tz_offset_minutes,
      }
    : null,
);
let timer: ReturnType<typeof setInterval> | undefined;
let calendarReadAt = 0;
function readSeries(clear = false) {
  if (range.value.period === 'all') {
    series.reset();
    return Promise.resolve();
  }
  const query = usageQueries(range.value).series;
  if (props.sharedRange && range.value.period === 'custom') Object.assign(query, rangeBounds(range.value));
  return series.load({ sessionId: props.sessionId, query }, clear);
}
function readCalendar(clear = false) {
  const now = Date.now();
  const query = usageQueries(calendarRange.value, now);
  timezone.value = query.timezone;
  calendarReadAt = now;
  return calendar.load(
    {
      sessionId: props.sessionId,
      query: {
        ...query.daily,
        bucket_ms: Math.ceil(((query.daily.days ?? 365) * 86400000) / (7 * calendarColumns.value)),
      },
    },
    clear,
  );
}
function refresh() {
  if (active.value) {
    void readSeries();
    void readCalendar();
  }
}
function stop() {
  clearInterval(timer);
  timer = undefined;
  series.cancel();
  calendar.cancel();
}
function start() {
  stop();
  refresh();
  timer = setInterval(() => {
    if (!series.loading.value) void readSeries();
    if (!calendar.loading.value && Date.now() - calendarReadAt >= cfg.stats.calendarRefreshMs) void readCalendar();
  }, cfg.stats.refreshMs);
}
function changeRange(value: RangeSelection) {
  localRange.value = value;
}
function changeCalendarRange(value: RangeSelection) {
  calendarRange.value = value;
  calendarSwitching.value = true;
}
watch(calendarColumns, () => {
  if (active.value) void readCalendar();
});
// Range switches keep the previous data rendered until the new window arrives
// (stale-while-revalidate): clearing here would unmount the canvas and flash.
watch(calendarRange, () => {
  if (active.value)
    void readCalendar().finally(() => {
      if (!calendar.loading.value) calendarSwitching.value = false;
    });
});
watch(range, () => {
  rangeSwitching.value = true;
  if (active.value)
    void readSeries().finally(() => {
      if (!series.loading.value) rangeSwitching.value = false;
    });
});
watch(
  () => props.sessionId,
  () => {
    series.reset();
    calendar.reset();
    if (active.value) {
      void readSeries(true);
      void readCalendar(true);
    }
  },
);
watch(active, (value) => (value ? start() : stop()), { immediate: true });
onScopeDispose(stop);
defineExpose({ refresh });
</script>
<template>
  <UsageChartPanel
    :data="data"
    :days="days"
    :heat="heat"
    :loading="series.loading.value"
    :calendar-loading="calendar.loading.value"
    :error="series.error.value"
    :calendar-error="calendar.error.value"
    :range="range"
    :shared="!!sharedRange"
    :hidden="hiddenModels"
    :calendar-range="calendarRange"
    :timezone="timezone"
    :range-switching="rangeSwitching"
    :calendar-switching="calendarSwitching"
    @calendar-columns="calendarColumns = $event"
    @range="changeRange"
    @calendar-range="changeCalendarRange"
    @refresh="refresh"
    @retry-calendar="readCalendar()"
    ><template #between><slot :speeds="speeds" /></template
  ></UsageChartPanel>
</template>
