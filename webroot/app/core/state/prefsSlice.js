// UI preferences slice. Persisted through the platform storage adapter —
// in a shell these become native settings with zero feature changes.
import { signal } from './reactive.js';
import { platform } from '../../platform/index.js';

export const prefs = (() => {
  const sendOnEnter = signal(true);
  const keepAwake = signal(false);
  const showAdvanced = signal(false);
  const loaded = signal(false);

  const KEYS = { sendOnEnter: 'pref.sendOnEnter', keepAwake: 'pref.keepAwake', showAdvanced: 'pref.showAdvanced' };

  function load() {
    let s; try { s = platform('storage'); } catch { s = null; }
    if (s) {
      if (s.get(KEYS.sendOnEnter) != null) sendOnEnter.value = s.get(KEYS.sendOnEnter) === '1';
      if (s.get(KEYS.keepAwake) != null) keepAwake.value = s.get(KEYS.keepAwake) === '1';
      if (s.get(KEYS.showAdvanced) != null) showAdvanced.value = s.get(KEYS.showAdvanced) === '1';
    }
    loaded.value = true;
  }

  function persist(key, sig) {
    let s; try { s = platform('storage'); } catch { s = null; }
    if (s) s.set(key, sig.peek() ? '1' : '0');
  }

  return {
    sendOnEnter, keepAwake, showAdvanced, loaded,
    load,
    setSendOnEnter(v) { sendOnEnter.value = v; persist(KEYS.sendOnEnter, sendOnEnter); },
    setKeepAwake(v) { keepAwake.value = v; persist(KEYS.keepAwake, keepAwake); },
    setShowAdvanced(v) { showAdvanced.value = v; persist(KEYS.showAdvanced, showAdvanced); },
  };
})();
