// What a provider reports about its account (GET /api/providers/{id}/account), and
// how to show it. The server keeps every number exactly as the service wrote it,
// as a decimal string; these helpers only format them, and leave out what is missing
// rather than inventing a zero.
import { tr } from '../../core/i18n/tr.ts';
import { i18n } from '../../core/i18n/index.ts';

export interface QuotaWindow {
  id: string;
  name: string | null;
  /** `tokens`, `requests`, `credits`, `time`, `currency_minor`, `unknown` or the service's own. */
  unit: string;
  used: string | null;
  limit: string | null;
  remaining: string | null;
  used_percent: string | null;
  /** Usually `{ duration, unit }`; kept as the service shaped it. */
  window: unknown;
  resets_at: string | null;
  reached: boolean | null;
  unlimited: boolean | null;
}
export interface Balance {
  currency: string;
  available: string | null;
  total: string | null;
  cash: string | null;
  granted: string | null;
  topped_up: string | null;
  voucher: string | null;
  credit: string | null;
  owed: string | null;
  minor_unit: number | null;
}
export type FailureKind = 'Unauthorized' | 'Unpaid' | 'Throttled' | 'Unknown';
export interface AccountFailure { kind: FailureKind; code: string | null; message: string }
export interface AccountState {
  protocol: string;
  quotas: QuotaWindow[];
  balances: Balance[];
  failure: AccountFailure | null;
  warnings: string[];
  availability: string | null;
  plan_type: string | null;
}

/** Protocols a provider can be read with on request (the others ride on model replies). */
export const ACCOUNT_PROTOCOLS = [
  'deepseek_user_balance', 'kimi_open_balance', 'kimi_code_companion_usage', 'zai_coding_plan_monitor',
  'minimax_token_plan_remains', 'minimax_account_balance', 'siliconflow_balance', 'openrouter_key_quota',
  'openrouter_credits', 'hf_whoami_billing', 'qwen_workspace_quota', 'openai_codex_usage',
];

const locale = () => (i18n.locale.value === 'zh' ? 'zh-CN' : 'en');
const number = (value: string | null | undefined) => {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Share of the allowance spent, 0–100; null when unlimited or not reported. */
export function quotaPercent(quota: QuotaWindow): number | null {
  if (quota.unlimited) return null;
  const reported = number(quota.used_percent);
  const used = number(quota.used), limit = number(quota.limit);
  const percent = reported ?? (used != null && limit ? (used / limit) * 100 : null);
  return percent == null ? null : Math.min(100, Math.max(0, percent));
}

/** Same thresholds as the context gauge: plenty, getting close, nearly spent. */
export function quotaLevel(quota: QuotaWindow): 'low' | 'mid' | 'high' {
  const percent = quotaPercent(quota);
  if (quota.reached || (percent ?? 0) >= 85) return 'high';
  return (percent ?? 0) >= 60 ? 'mid' : 'low';
}

const MINUTES: Record<string, number> = { second: 1 / 60, seconds: 1 / 60, minute: 1, minutes: 1, hour: 60, hours: 60, day: 1440, days: 1440, week: 10080, weeks: 10080 };

/** The window's length in minutes, when it is described as `{ duration, unit }`. */
export function windowMinutes(window: unknown): number | null {
  if (!window || typeof window !== 'object') return null;
  const { duration, unit } = window as { duration?: unknown; unit?: unknown };
  const scale = typeof unit === 'string' ? MINUTES[unit.toLowerCase()] : undefined;
  return typeof duration === 'number' && duration > 0 && scale ? duration * scale : null;
}

export function windowLabel(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 7 ? tr('每周', 'Weekly') : tr(`${days} 天`, `${days} days`);
  }
  if (minutes >= 60 && minutes % 60 === 0) return tr(`${minutes / 60} 小时`, `${minutes / 60} hours`);
  return tr(`${minutes} 分钟`, `${minutes} min`);
}

/** "5 hours", "Weekly", "Monthly": how long a window lasts, when it says. */
export function windowText(window: unknown): string | null {
  if (window && typeof window === 'object') {
    // A calendar month has no fixed length, so it arrives in months rather than minutes.
    const { duration, unit } = window as { duration?: unknown; unit?: unknown };
    if (typeof duration === 'number' && typeof unit === 'string' && /^months?$/i.test(unit)) {
      return duration === 1 ? tr('每月', 'Monthly') : tr(`${duration} 个月`, `${duration} months`);
    }
  }
  const minutes = windowMinutes(window);
  return minutes == null ? null : windowLabel(minutes);
}

const UNIT_NOUNS: Record<string, [string, string]> = {
  tokens: ['Token', 'Tokens'], requests: ['调用次数', 'Calls'], credits: ['额度', 'Credits'],
  time: ['时长', 'Time'], currency_minor: ['金额', 'Amount'],
};

/** "Tokens · 5 hours", or the service's own name for a window it does not describe. */
export function quotaTitle(quota: QuotaWindow): string {
  const window = windowText(quota.window);
  const noun = UNIT_NOUNS[quota.unit];
  const what = noun ? tr(noun[0], noun[1]) : quota.unit !== 'unknown' ? quota.unit : tr('用量', 'Usage');
  if (window) return `${what} · ${window}`;
  return noun || quota.unit !== 'unknown' ? what : quota.name ?? quota.id;
}

/** Reset times arrive as Unix seconds, Unix milliseconds or a date string. */
export function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const numeric = number(value);
  const date = numeric != null ? new Date(numeric > 1e12 ? numeric : numeric * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Resets in 3 hours" for the next day or so, then the date itself. */
export function resetLabel(value: string | null | undefined, now = Date.now()): string | null {
  const date = parseInstant(value);
  if (!date) return null;
  const seconds = (date.getTime() - now) / 1000;
  if (seconds <= 0) return tr('即将重置', 'Resets soon');
  if (seconds < 36 * 3600) {
    const format = new Intl.RelativeTimeFormat(locale(), { numeric: 'always' });
    const text = seconds < 3600 ? format.format(Math.ceil(seconds / 60), 'minute') : format.format(Math.round(seconds / 3600), 'hour');
    return tr(`${text}重置`, `Resets ${text}`);
  }
  const when = date.toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return tr(`${when} 重置`, `Resets ${when}`);
}

const compact = (value: number) => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/** "12.4K / 100K" in the window's own unit, or what is left when that is all it says. */
export function quotaAmounts(quota: QuotaWindow): string | null {
  if (quota.unlimited) return tr('不限量', 'Unlimited');
  const show = (value: string | null) => { const n = number(value); return n == null ? value : compact(n); };
  if (quota.used != null && quota.limit != null) return `${show(quota.used)} / ${show(quota.limit)}`;
  if (quota.remaining != null) return tr(`剩余 ${show(quota.remaining)}`, `${show(quota.remaining)} left`);
  if (quota.used != null) return tr(`已用 ${show(quota.used)}`, `${show(quota.used)} used`);
  return null;
}

/** An amount in its currency; minor units are scaled, unknown units are named after the number. */
export function formatAmount(value: string | null, currency: string, minorUnit: number | null = null): string | null {
  const parsed = number(value);
  if (parsed == null) return value;
  const amount = minorUnit ? parsed / 10 ** minorUnit : parsed;
  if (/^[A-Z]{3}$/.test(currency)) {
    try { return new Intl.NumberFormat(locale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount); }
    catch { /* not an ISO currency after all */ }
  }
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 4 }).format(amount)} ${currency}`;
}

/** The labelled parts of a balance that the service reported, beside the headline amount. */
export function balanceParts(balance: Balance): { label: string; value: string }[] {
  const parts: [keyof Balance, string, string][] = [
    ['total', '总额', 'Total'], ['topped_up', '充值', 'Topped up'], ['granted', '赠送', 'Granted'],
    ['cash', '现金', 'Cash'], ['voucher', '代金券', 'Vouchers'], ['credit', '信用额度', 'Credit'], ['owed', '欠款', 'Owed'],
  ];
  const headline = balance.available != null ? 'available' : 'total';
  return parts
    .filter(([key]) => key !== headline && balance[key] != null)
    .map(([key, zh, en]) => ({ label: tr(zh, en), value: formatAmount(balance[key] as string, balance.currency, balance.minor_unit) ?? '' }));
}

export function failureLabel(kind: FailureKind): string {
  switch (kind) {
    case 'Unauthorized': return tr('凭据无效或无权查询账户', 'The credentials were refused');
    case 'Unpaid': return tr('账户余额不足', 'The account has nothing left to spend');
    case 'Throttled': return tr('服务暂时限制了请求', 'The service is limiting requests for now');
    default: return tr('服务报告了一个问题', 'The service reported a problem');
  }
}
