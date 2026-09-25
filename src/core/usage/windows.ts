import type { DailyQuery, SeriesQuery } from './types.ts';
export type UsageRange = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export interface RangeSelection { period: UsageRange; start?: string; end?: string }
/** Totals may also cover everything recorded. */
export type TotalsRange = RangeSelection | { period: 'all' };
/** Millisecond bounds for a totals query; none for all time. */
export function rangeBounds(range: TotalsRange, now = Date.now()): { from_ms?: number; to_ms?: number } {
  if (range.period === 'all') return {};
  if (range.period === 'custom') {
    const end = new Date(range.end! + 'T00:00:00'); end.setDate(end.getDate() + 1);
    return { from_ms: new Date(range.start! + 'T00:00:00').getTime(), to_ms: Math.min(end.getTime(), now + 1) };
  }
  return { from_ms: now - rangeDays[range.period] * 86_400_000 };
}
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
