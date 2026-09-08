// UI preferences slice. Persisted through the platform storage adapter —
// in a shell these become native settings with zero feature changes.
import { signal } from './reactive.js';
import { platform } from '../../platform/index.js';

export const prefs = (() => {
  const sendOnEnter = signal(true);
  const keepAwake = signal(false);
  const showAdvanced = signal(false);
  const notifyOnFailure = signal(false);   // decisions 22: default OFF
  const loaded = signal(false);

  const KEYS = { sendOnEnter: 'pref.sendOnEnter', keepAwake: 'pref.keepAwake', showAdvanced: 'pref.showAdvanced', notifyOnFailure: 'pref.notifyOnFailure' };

  function load() {
    const s = platform('storage');
    if (s.get(KEYS.sendOnEnter) != null) sendOnEnter.value = s.get(KEYS.sendOnEnter) === '1';
    if (s.get(KEYS.keepAwake) != null) keepAwake.value = s.get(KEYS.keepAwake) === '1';
    if (s.get(KEYS.showAdvanced) != null) showAdvanced.value = s.get(KEYS.showAdvanced) === '1';
    if (s.get(KEYS.notifyOnFailure) != null) notifyOnFailure.value = s.get(KEYS.notifyOnFailure) === '1';
    loaded.value = true;
  }

  function persist(key, sig) {
    platform('storage').set(key, sig.peek() ? '1' : '0');
  }

  return {
    sendOnEnter, keepAwake, showAdvanced, notifyOnFailure, loaded,
    load,
    setSendOnEnter(v) { sendOnEnter.value = v; persist(KEYS.sendOnEnter, sendOnEnter); },
    setKeepAwake(v) { keepAwake.value = v; persist(KEYS.keepAwake, keepAwake); },
    setShowAdvanced(v) { showAdvanced.value = v; persist(KEYS.showAdvanced, showAdvanced); },
    setNotifyOnFailure(v) { notifyOnFailure.value = v; persist(KEYS.notifyOnFailure, notifyOnFailure); },
  };
})();
