// i18n core. DOM-free: shells can localize native UI with the same
// dictionaries. The browser UI syncs <html lang> on locale change.
import { shallowRef } from 'vue';
import { cfg } from '../config.ts';
import { zh } from './zh.ts';
import { en } from './en.ts';

export type Locale = 'zh' | 'en';
const DICTS: Record<string, Record<string, string>> = { zh, en };

export const i18n = (() => {
  const locale = shallowRef(cfg.i18n.defaultLocale as Locale);

  function t(key: string, params?: Record<string, unknown>) {
    const dict = DICTS[locale.value] ?? DICTS[cfg.i18n.fallback];
    let str = dict[key] ?? DICTS[cfg.i18n.fallback][key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replaceAll(`{${k}}`, String(v));
      }
    }
    return str;
  }

  function setLocale(next: string) {
    if (!cfg.i18n.locales.includes(next)) return false;
    locale.value = next as Locale;
    return true;
  }

  return { locale, t, setLocale, locales: cfg.i18n.locales };
})();
