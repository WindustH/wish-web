// Theme core: system-follow + manual override, persisted through the
// platform storage adapter (injected at bootstrap — core stays DOM-free).
import { shallowRef } from 'vue';
import { cfg } from '../config.js';

export const theme = (() => {
  const mode = shallowRef(cfg.theme.defaultMode);      // auto | light | dark
  const resolved = shallowRef('light');                // light | dark (after system)
  let storage = null;                              // platform adapter
  let watchSystem = null;                          // (cb) => void
  let readSystem = null;                           // () => 'light' | 'dark'

  function computeResolved() {
    const sys = readSystem ? readSystem() : 'light';
    const next = mode.value === 'auto' ? sys : mode.value;
    if (next === 'light' || next === 'dark') resolved.value = next;
  }

  return {
    mode,
    resolved,
    init({ storageAdapter, watchSystem: ws, readSystem: rs }) {
      storage = storageAdapter || null;
      if (storage) {
        const saved = storage.get(cfg.theme.storageKey);
        if (cfg.theme.modes.includes(saved)) mode.value = saved;
      }
      watchSystem = ws || null;
      readSystem = rs || null;
      if (watchSystem) watchSystem(computeResolved);
      computeResolved();
    },
    setMode(next) {
      if (!cfg.theme.modes.includes(next)) return;
      mode.value = next;
      storage?.set(cfg.theme.storageKey, next);
      computeResolved();
    },
  };
})();
