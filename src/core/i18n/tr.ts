import { i18n } from './index.js';

export const tr = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;
