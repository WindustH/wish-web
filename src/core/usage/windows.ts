import type { DailyQuery, SeriesQuery } from './types';
export type UsageRange = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export interface RangeSelection { period: UsageRange; start?: string; end?: string }
const rangeDays = { day: 1, week: 7, month: 30, quarter: 90, year: 365 };
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
/** Dates are sent with the same explicit fixed offset used by the backend. */
export function usageQueries(range: UsageRange | RangeSelection, now = Date.now(), offsetMinutes = -new Date(now).getTimezoneOffset()): { series: SeriesQuery; daily: DailyQuery; timezone: string } {
  const selected = typeof range === 'string' ? { period: range } : range;
  const end = selected.period === 'custom' ? selected.end! : new Date(now + offsetMinutes * 60_000).toISOString().slice(0,10);
  const days = selected.period === 'custom' ? Math.round((Date.parse(end) - Date.parse(selected.start!))/86_400_000)+1 : rangeDays[selected.period];
  const bucket = days <= 1 ? '1h' : days <= 7 ? '6h' : '1d';
  const series: SeriesQuery = selected.period === 'custom'
    ? { window: 'custom', bucket, from_ms: new Date(selected.start!+'T00:00:00').getTime(), to_ms: Math.min(new Date(new Date(end+'T00:00:00').setDate(new Date(end+'T00:00:00').getDate()+1)).getTime(), Math.ceil(now/3_600_000)*3_600_000) }
    : { window: ({day:'1d',week:'7d',month:'30d',quarter:'90d',year:'365d'} as const)[selected.period], bucket };
  return { series, daily: { days, end_date: end, tz_offset_minutes: offsetMinutes }, timezone: offsetLabel(offsetMinutes) };
}

export function offsetLabel(minutes: number) {
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? '−' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}
