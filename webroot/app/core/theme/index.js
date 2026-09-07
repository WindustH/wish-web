// Theme core: system-follow + manual override, persisted through the
// platform storage adapter (injected at bootstrap — core stays DOM-free).
import { cfg } from '../config.js';
import { signal } from '../state/reactive.js';

export const theme = (() => {
  const mode = signal(cfg.theme.defaultMode);      // auto | light | dark
  const resolved = signal('light');                // light | dark (after system)
  let storage = null;                              // platform adapter
  let systemWatcher = null;

  function computeResolved() {
    const sys = systemWatcher ? systemWatcher() : 'light';
    resolved.value = mode.peek() === 'auto' ? sys : mode.peek();
  }

  return {
    mode,
    resolved,
    init({ storageAdapter, watchSystem }) {
      storage = storageAdapter || null;
      if (storage) {
        const saved = storage.get(cfg.theme.storageKey);
        if (cfg.theme.modes.includes(saved)) mode.value = saved;
      }
      systemWatcher = watchSystem || null;
      if (systemWatcher) systemWatcher(computeResolved);
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
