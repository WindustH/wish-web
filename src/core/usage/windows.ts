import { cfg } from '../config.js';
import type { DailyQuery, SeriesQuery } from './types';
export type UsageRange = 'day' | 'week';
/** Dates are sent with the same explicit fixed offset used by the backend. */
export function usageQueries(range: UsageRange, now = Date.now(), offsetMinutes = -new Date(now).getTimezoneOffset()): { series: SeriesQuery; daily: DailyQuery; timezone: string } {
  return {
    series: { window: range === 'day' ? '1d' : '7d', bucket: range === 'day' ? '1h' : '6h' },
    daily: { days: cfg.stats.calendarDays, end_date: new Date(now + offsetMinutes * 60_000).toISOString().slice(0, 10), tz_offset_minutes: offsetMinutes },
    timezone: offsetLabel(offsetMinutes),
  };
}
export function offsetLabel(minutes: number) {
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? '−' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}
