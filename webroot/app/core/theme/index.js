// Theme core: system-follow + manual override, persisted through the
// platform storage adapter (injected at bootstrap — core stays DOM-free).
import { cfg } from '../config.js';
import { signal } from '../state/reactive.js';

export const theme = (() => {
  const mode = signal(cfg.theme.defaultMode);      // auto | light | dark
  const resolved = signal('light');                // light | dark (after system)
  let storage = null;                              // platform adapter
  let watchSystem = null;                          // (cb) => void
  let readSystem = null;                           // () => 'light' | 'dark'

  function computeResolved() {
    const sys = readSystem ? readSystem() : 'light';
    const next = mode.peek() === 'auto' ? sys : mode.peek();
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
