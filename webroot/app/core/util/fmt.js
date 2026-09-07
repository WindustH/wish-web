// Formatting helpers shared by core and UI (DOM-free).

export function fmtTokens(n) {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

export function relTime(tsMs, t) {
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

export function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function fmtBytes(b) {
  if (b == null) return '—';
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i ? 1 : 0) + ' ' + u[i];
}

export function parseIso(iso) {
  return iso ? Date.parse(iso) : null;
}

export function debounce(fn, ms) {
  let h = null;
  const wrapped = (...args) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(h); fn(...args); };
  wrapped.cancel = () => clearTimeout(h);
  return wrapped;
}

// Random printable-ASCII idempotency key (wishd requires ≥16 bytes).
export function idemKey(len = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.';
  let out = '';
  const rnd = new Uint8Array(len);
  (globalThis.crypto || {}).getRandomValues
    ? crypto.getRandomValues(rnd)
    : rnd.forEach((_, i) => (rnd[i] = Math.floor(Math.random() * 256)));
  for (let i = 0; i < len; i++) out += chars[rnd[i] % chars.length];
  return `wui-${out}`.slice(0, Math.max(len, 16));
}

export function truncate(s, n) {
  if (typeof s !== 'string' || s.length <= n) return s ?? '';
  return s.slice(0, n - 1) + '…';
}

export function firstLine(s, n = 120) { return truncate((s || '').split('\n', 1)[0].trim(), n); }
