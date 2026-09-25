// Theme core: system-follow + manual override, persisted through the
// platform storage adapter (injected at bootstrap — core stays DOM-free).
import { shallowRef } from 'vue';
import { cfg } from '../config.ts';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
interface ThemeStorage { get(key: string): string | null; set(key: string, value: string): void }
export interface ThemeInit {
  storageAdapter?: ThemeStorage | null;
  watchSystem?: ((cb: () => void) => void) | null;
  readSystem?: (() => ResolvedTheme) | null;
}

export const theme = (() => {
  const mode = shallowRef(cfg.theme.defaultMode as ThemeMode);
  const resolved = shallowRef<ResolvedTheme>('light');   // after following the system
  let storage: ThemeStorage | null = null;               // platform adapter
  let watchSystem: ThemeInit['watchSystem'] = null;
  let readSystem: ThemeInit['readSystem'] = null;

  function computeResolved() {
    const sys = readSystem ? readSystem() : 'light';
    const next = mode.value === 'auto' ? sys : mode.value;
    if (next === 'light' || next === 'dark') resolved.value = next;
  }

  return {
    mode,
    resolved,
    init({ storageAdapter, watchSystem: ws, readSystem: rs }: ThemeInit) {
      storage = storageAdapter || null;
      if (storage) {
        const saved = storage.get(cfg.theme.storageKey);
        if (saved && cfg.theme.modes.includes(saved)) mode.value = saved as ThemeMode;
      }
      watchSystem = ws || null;
      readSystem = rs || null;
      if (watchSystem) watchSystem(computeResolved);
      computeResolved();
    },
    setMode(next: string) {
      if (!cfg.theme.modes.includes(next)) return;
      mode.value = next as ThemeMode;
      storage?.set(cfg.theme.storageKey, next);
      computeResolved();
    },
  };
})();
