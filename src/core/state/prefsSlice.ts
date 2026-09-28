// UI preferences slice. Persisted through the platform storage adapter —
// in a shell these become native settings with zero feature changes.
import { shallowRef, type ShallowRef } from 'vue';
import { platform } from '../../platform/index.ts';

export const prefs = (() => {
  const sendOnEnter = shallowRef(true);
  const keepAwake = shallowRef(false);
  const showAdvanced = shallowRef(false);
  const notifyOnFailure = shallowRef(false);   // decisions 22: default OFF
  const sessionListCollapsed = shallowRef(false);
  // Text size on this device, as a share of its standard size (phones read a step larger).
  const textSize = shallowRef(1);
  const loaded = shallowRef(false);

  const KEYS = { sendOnEnter: 'pref.sendOnEnter', keepAwake: 'pref.keepAwake', showAdvanced: 'pref.showAdvanced', notifyOnFailure: 'pref.notifyOnFailure', sessionListCollapsed: 'pref.sessionListCollapsed', textSize: 'pref.textSize' };

  function load() {
    const s = platform('storage');
    if (s.get(KEYS.sendOnEnter) != null) sendOnEnter.value = s.get(KEYS.sendOnEnter) === '1';
    if (s.get(KEYS.keepAwake) != null) keepAwake.value = s.get(KEYS.keepAwake) === '1';
    if (s.get(KEYS.showAdvanced) != null) showAdvanced.value = s.get(KEYS.showAdvanced) === '1';
    if (s.get(KEYS.notifyOnFailure) != null) notifyOnFailure.value = s.get(KEYS.notifyOnFailure) === '1';
    sessionListCollapsed.value = s.get(KEYS.sessionListCollapsed) === '1';
    const size = Number(s.get(KEYS.textSize));
    textSize.value = size >= .8 && size <= 1.4 ? size : 1;
    applyTextSize();
    loaded.value = true;
  }

  // Font sizes are rem (tools write px; the build converts them), so the root's size scales all text.
  function applyTextSize() {
    if (typeof document !== 'undefined') document.documentElement.style.setProperty('--text-size', String(textSize.value));
  }

  function persist(key: string, sig: ShallowRef<boolean>) {
    platform('storage').set(key, sig.value ? '1' : '0');
  }

  return {
    sendOnEnter, keepAwake, showAdvanced, notifyOnFailure, sessionListCollapsed, textSize, loaded,
    load,
    setSendOnEnter(v: boolean) { sendOnEnter.value = v; persist(KEYS.sendOnEnter, sendOnEnter); },
    setKeepAwake(v: boolean) { keepAwake.value = v; persist(KEYS.keepAwake, keepAwake); },
    setShowAdvanced(v: boolean) { showAdvanced.value = v; persist(KEYS.showAdvanced, showAdvanced); },
    setNotifyOnFailure(v: boolean) { notifyOnFailure.value = v; persist(KEYS.notifyOnFailure, notifyOnFailure); },
    setSessionListCollapsed(v: boolean) { sessionListCollapsed.value = v; persist(KEYS.sessionListCollapsed, sessionListCollapsed); },
    setTextSize(v: number) { textSize.value = v; platform('storage').set(KEYS.textSize, String(v)); applyTextSize(); },
  };
})();
export type PrefsApi = typeof prefs;
