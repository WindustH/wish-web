// UI preferences slice. Persisted through the platform storage adapter —
// in a shell these become native settings with zero feature changes.
import { shallowRef } from 'vue';
import { cfg } from '../config.ts';
import { platform } from '../../platform/index.ts';

// An on/off preference, stored as '1' or '0'; until one is stored it has its default.
function toggle(key: string, fallback: boolean) {
  const value = shallowRef(fallback);
  return {
    value,
    load() {
      const stored = platform('storage').get(key);
      if (stored != null) value.value = stored === '1';
    },
    set(next: boolean) {
      value.value = next;
      platform('storage').set(key, next ? '1' : '0');
    },
  };
}

export const prefs = (() => {
  const sendOnEnter = toggle('pref.sendOnEnter', cfg.composer.sendOnEnter);
  const keepAwake = toggle('pref.keepAwake', false);
  const notifyOnFailure = toggle('pref.notifyOnFailure', false);   // decisions 22: default OFF
  const sessionListCollapsed = toggle('pref.sessionListCollapsed', false);
  // Text size on this device, as a share of its standard size (phones read a step larger).
  const TEXT_SIZE = 'pref.textSize';
  const textSize = shallowRef(1);
  const loaded = shallowRef(false);

  function load() {
    for (const pref of [sendOnEnter, keepAwake, notifyOnFailure, sessionListCollapsed]) pref.load();
    const size = Number(platform('storage').get(TEXT_SIZE));
    textSize.value = size >= .8 && size <= 1.4 ? size : 1;
    applyTextSize();
    loaded.value = true;
  }

  // Font sizes are rem (tools write px; the build converts them), so the root's size scales all text.
  function applyTextSize() {
    if (typeof document !== 'undefined') document.documentElement.style.setProperty('--text-size', String(textSize.value));
  }

  return {
    sendOnEnter: sendOnEnter.value,
    keepAwake: keepAwake.value,
    notifyOnFailure: notifyOnFailure.value,
    sessionListCollapsed: sessionListCollapsed.value,
    textSize,
    loaded,
    load,
    setSendOnEnter: sendOnEnter.set,
    setKeepAwake: keepAwake.set,
    setNotifyOnFailure: notifyOnFailure.set,
    setSessionListCollapsed: sessionListCollapsed.set,
    setTextSize(v: number) { textSize.value = v; platform('storage').set(TEXT_SIZE, String(v)); applyTextSize(); },
  };
})();
export type PrefsApi = typeof prefs;
