// i18n core. DOM-free: shells can localize native UI with the same
// dictionaries. The browser UI syncs <html lang> on locale change.
import { shallowRef } from 'vue';
import { cfg } from '../config.js';
import { zh } from './zh.js';
import { en } from './en.js';

const DICTS = { zh, en };

export const i18n = (() => {
  const locale = shallowRef(cfg.i18n.defaultLocale);

  function t(key, params) {
    const dict = DICTS[locale.value] ?? DICTS[cfg.i18n.fallback];
    let str = dict[key] ?? DICTS[cfg.i18n.fallback][key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replaceAll(`{${k}}`, String(v));
      }
    }
    return str;
  }

  function setLocale(next) {
    if (!cfg.i18n.locales.includes(next)) return false;
    locale.value = next;
    return true;
  }

  return { locale, t, setLocale, locales: cfg.i18n.locales };
})();
