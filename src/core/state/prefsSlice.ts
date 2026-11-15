// UI preferences slice. Persisted through the platform storage adapter —
// in a shell these become native settings with zero feature changes.
import { shallowRef } from 'vue';
import { cfg } from '../config.ts';
import { platform } from '../../platform/index.ts';
import { shortcuts } from './shortcutsSlice.ts';

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
  const originalImages = toggle('pref.originalImages', false);
  const sourceWrap = toggle('pref.sourceWrap', true);
  const sendOnEnter = toggle('pref.sendOnEnter', cfg.composer.sendOnEnter);
  const keepAwake = toggle('pref.keepAwake', false);
  const notifyOnFailure = toggle('pref.notifyOnFailure', false); // decisions 22: default OFF
  const sessionListCollapsed = toggle('pref.sessionListCollapsed', false);
  // Text size on this device, as a share of its standard size (phones read a step larger).
  const TEXT_SIZE = 'pref.textSize';
  const textSize = shallowRef(1);
  const loaded = shallowRef(false);
  const rightSidebarWidth = shallowRef(0);
  function setRightSidebarWidth(width: number) {
    rightSidebarWidth.value = Number.isFinite(width) && width >= 280 ? width : 0;
    platform('storage').set('pref.rightSidebarWidth', String(rightSidebarWidth.value));
  }

  function load() {
    shortcuts.load();
    const width = Number(platform('storage').get('pref.rightSidebarWidth'));
    rightSidebarWidth.value = Number.isFinite(width) && width >= 280 ? width : 0;
    for (const pref of [sendOnEnter, keepAwake, notifyOnFailure, sessionListCollapsed, originalImages, sourceWrap])
      pref.load();
    const size = Number(platform('storage').get(TEXT_SIZE));
    textSize.value = size >= 0.8 && size <= 1.4 ? size : 1;
    loaded.value = true;
  }

  return {
    rightSidebarWidth,
    setRightSidebarWidth,
    originalImages: originalImages.value,
    setOriginalImages: originalImages.set,
    sourceWrap: sourceWrap.value,
    setSourceWrap: sourceWrap.set,
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
    setTextSize(v: number) {
      textSize.value = Number.isFinite(v) ? Math.max(0.8, Math.min(1.4, v)) : 1;
      platform('storage').set(TEXT_SIZE, String(textSize.value));
    },
  };
})();
export type PrefsApi = typeof prefs;
