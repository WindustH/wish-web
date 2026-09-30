import { i18n } from './index.ts';

export const tr = (zh: string, en: string) => i18n.locale.value === 'zh' ? zh : en;

/** The Intl locale for the UI language, for number and date formatting. */
export const intlLocale = () => i18n.locale.value === 'zh' ? 'zh-CN' : 'en';
