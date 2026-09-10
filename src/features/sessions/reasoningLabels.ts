import { i18n } from '../../core/i18n/index.js';
export function effortLabel(level?: string) {
  return level || i18n.t('reasoning.default');
}
