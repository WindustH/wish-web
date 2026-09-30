// Formatting helpers shared by core and UI (DOM-free).
import { i18n, type Locale } from '../i18n/index.ts';
import { intlLocale } from '../i18n/tr.ts';

const compactFmt: Record<Locale, Intl.NumberFormat | undefined> = { zh: undefined, en: undefined };
/** A number in compact notation, in the UI language: 235929 reads "23.6万" / "236K". */
export function compactNumber(n: number) {
  const loc = i18n.locale.value;
  compactFmt[loc] ??= new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 });
  return compactFmt[loc].format(n);
}

/** A positive number in compact notation, and nothing for anything else. */
export const compactPositive = (value: unknown) => typeof value === 'number' && value > 0 ? compactNumber(value) : '';

export function fmtTokens(n: number | null | undefined) {
  if (n == null) return '—';
  return compactNumber(n);
}

export function relTime(tsMs: number | null | undefined, t: typeof i18n.t) {
  if (tsMs == null) return t('common.never');
  const d = Date.now() - tsMs;
  const m = Math.floor(d / 60_000);
  if (m < 1) return t('time.justNow');
  if (m < 60) return t('time.minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hoursAgo', { n: h });
  const days = Math.floor(h / 24);
  if (days < 14) return t('time.daysAgo', { n: days });
  return t('time.older');
}

export function fmtBytes(b: number | null | undefined) {
  if (b == null) return '—';
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i ? 1 : 0) + ' ' + u[i];
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let h: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args: A) => { clearTimeout(h); fn(...args); };
  wrapped.cancel = () => clearTimeout(h);
  return wrapped;
}


function truncate(s: string, n: number) {
  if (typeof s !== 'string' || s.length <= n) return s ?? '';
  return s.slice(0, n - 1) + '…';
}

export function firstLine(s: string | null | undefined, n = 120) { return truncate((s || '').split('\n', 1)[0].trim(), n); }

/** Locale-aware date-time for user-facing surfaces; follows the UI language
 *  (round-4 #4: Intl formatting must track i18n.locale, not the OS). */
export function fmtDateTime(ts: number | string | Date | null | undefined) {
  if (ts == null) return '—';
  return new Intl.DateTimeFormat(i18n.locale.value, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}
