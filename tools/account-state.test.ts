import { test } from 'node:test';
import assert from 'node:assert/strict';
import { i18n } from '../src/core/i18n/index.ts';
import { balanceParts, formatAmount, parseInstant, quotaAmounts, quotaLevel, quotaParts, quotaPercent, quotaTitle, resetLabel, type Balance, type QuotaWindow } from '../src/features/account/accountState.ts';

const quota = (fields: Partial<QuotaWindow>): QuotaWindow => ({
  id: 'primary', name: null, unit: 'unknown', used: null, limit: null, remaining: null, used_percent: null,
  window: null, resets_at: null, reached: null, unlimited: null, ...fields,
});

test('usage uses the reported share, or the amounts when that is all there is', () => {
  assert.equal(quotaPercent(quota({ used_percent: '9' })), 9);
  assert.equal(quotaPercent(quota({ used: '4', limit: '4000' })), 0.1);
  assert.equal(quotaPercent(quota({ unlimited: true, used_percent: '50' })), null);
  assert.equal(quotaPercent(quota({})), null);
  assert.equal(quotaLevel(quota({ used_percent: '70' })), 'mid');
  assert.equal(quotaLevel(quota({ used_percent: '1', reached: true })), 'high');
});

test('windows are named by what they count and how long they last', () => {
  i18n.setLocale('en');
  assert.equal(quotaTitle(quota({ window: { duration: 300, unit: 'minutes' } })), 'Usage · 5 hours');
  assert.equal(quotaTitle(quota({ unit: 'tokens', window: { duration: 10080, unit: 'minutes' } })), 'Tokens · Weekly');
  assert.equal(quotaTitle(quota({ id: 'model_1', name: 'GLM' })), 'GLM');
  assert.equal(quotaTitle(quota({ unit: 'requests', window: { duration: 1, unit: 'months' } })), 'Calls · Monthly');
  assert.equal(quotaTitle(quota({ name: 'TIME_LIMIT', unit: 'requests', window: { duration: 1, unit: 'months' } }), 'ZaiCodingPlanMonitor'), 'MCP calls · Monthly');
  assert.equal(quotaAmounts(quota({ used: '4', limit: '4000' })), '4 / 4K');
  assert.equal(quotaParts(quota({ parts: [{ id: 'search-prime', used: '4' }, { id: 'web-reader', used: '0' }, { id: 'custom-tool', used: null }] })),
    'Web search 4 · Web reader 0 · custom-tool —');
  assert.equal(quotaParts(quota({})), null);
  i18n.setLocale('zh');
  assert.equal(quotaTitle(quota({ unit: 'tokens', window: { duration: 300, unit: 'minutes' } })), 'Token · 5 小时');
});

test('reset times accept seconds, milliseconds and dates', () => {
  assert.equal(parseInstant('1790513311')?.getTime(), 1790513311000);
  assert.equal(parseInstant('1790587039983')?.getTime(), 1790587039983);
  assert.equal(parseInstant('2026-09-28T00:00:00Z')?.toISOString(), '2026-09-28T00:00:00.000Z');
  assert.equal(parseInstant('soon'), null);
  i18n.setLocale('en');
  assert.equal(resetLabel('1000', 1000 * 1000 + 1), 'Resets soon');
  assert.equal(resetLabel(String(3 * 3600), 0), 'Resets in 3 hours');
  i18n.setLocale('zh');
});

test('balances keep the reported amount and list the parts beside it', () => {
  i18n.setLocale('en');
  const balance: Balance = { currency: 'CNY', available: null, total: '3.51', cash: null, granted: '0.00', topped_up: '3.51', voucher: null, credit: null, owed: null, minor_unit: null };
  assert.equal(formatAmount(balance.total, 'CNY'), 'CN¥3.51');
  assert.deepEqual(balanceParts(balance).map(part => part.label), ['Topped up', 'Granted']);
  assert.equal(formatAmount('1234', 'USD', 2), '$12.34');
  assert.equal(formatAmount('7', 'credits'), '7 credits');
  assert.equal(formatAmount(null, 'CNY'), null);
  i18n.setLocale('zh');
});
