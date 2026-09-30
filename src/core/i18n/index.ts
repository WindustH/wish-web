// i18n core. DOM-free: shells can localize native UI with the same
// dictionaries. The browser UI syncs <html lang> on locale change.
import { shallowRef } from 'vue';
import { cfg } from '../config.ts';
import { zh } from './zh.ts';
import { en } from './en.ts';

export type Locale = 'zh' | 'en';
// What the user chose: a language, or 'auto' to follow the system's.
export type LocaleChoice = 'auto' | Locale;
const DICTS: Record<string, Record<string, string>> = { zh, en };
interface LocaleStorage { get(key: string): string | null; set(key: string, value: string): void }
export interface LocaleInit {
  storageAdapter?: LocaleStorage | null;
  // The system's languages in order of preference, as BCP 47 tags.
  readSystem?: (() => readonly string[]) | null;
  watchSystem?: ((cb: () => void) => void) | null;
}

// The first of the system's languages Wish has, by primary subtag: zh-CN, zh-TW and zh-Hans all
// read as zh.
function systemLocale(tags: readonly string[]): Locale {
  if (!tags.length) return cfg.i18n.defaultLocale as Locale;
  for (const tag of tags) {
    const primary = tag.toLowerCase().split('-')[0]!;
    if (cfg.i18n.locales.includes(primary)) return primary as Locale;
  }
  return cfg.i18n.fallback as Locale;
}

export const i18n = (() => {
  const choice = shallowRef<LocaleChoice>('auto');
  const locale = shallowRef(cfg.i18n.defaultLocale as Locale);   // the language shown
  let storage: LocaleStorage | null = null;
  let readSystem: LocaleInit['readSystem'] = null;
  const resolve = () => { locale.value = choice.value === 'auto' ? systemLocale(readSystem?.() ?? []) : choice.value; };

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

  // Shows a language without remembering it as the user's choice.
  function setLocale(next: string) {
    if (!cfg.i18n.locales.includes(next)) return false;
    locale.value = next as Locale;
    return true;
  }

  function setChoice(next: string) {
    if (next !== 'auto' && !cfg.i18n.locales.includes(next)) return;
    choice.value = next as LocaleChoice;
    storage?.set(cfg.i18n.storageKey, next);
    resolve();
  }

  function init({ storageAdapter, readSystem: rs, watchSystem }: LocaleInit) {
    storage = storageAdapter || null;
    const saved = storage?.get(cfg.i18n.storageKey);
    if (saved && (saved === 'auto' || cfg.i18n.locales.includes(saved))) choice.value = saved as LocaleChoice;
    readSystem = rs || null;
    watchSystem?.(() => { if (choice.value === 'auto') resolve(); });
    resolve();
  }

  return { locale, choice, t, setLocale, setChoice, init, locales: cfg.i18n.locales };
})();
