import { i18n } from '../../core/i18n/index.js';
export function effortLabel(level?: string) {
  if (!level) return i18n.t('reasoning.default');
  const names: Record<string, string> = { none: 'reasoning.none', off: 'reasoning.off', minimal: 'reasoning.minimal', low: 'reasoning.low', medium: 'reasoning.medium', high: 'reasoning.high', xhigh: 'reasoning.xhigh', max: 'reasoning.max' };
  return names[level] ? i18n.t(names[level]) : level;
}
