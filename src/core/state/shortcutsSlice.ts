import { readonly, shallowRef, type DeepReadonly } from 'vue';
import { platform } from '../../platform/index.ts';
import {
  defaultShortcuts,
  readShortcuts,
  sameBinding,
  shortcutIds,
  validBinding,
  type NavigationPreferences,
  type BrowserShortcut,
  type KeyBinding,
  type ShortcutId,
  type ShortcutPreferences,
} from '../shortcuts.ts';

const storageKey = 'pref.shortcuts';
const value = shallowRef(defaultShortcuts());
function replace(next: DeepReadonly<ShortcutPreferences>) {
  value.value = readShortcuts(next);
  platform('storage').set(storageKey, JSON.stringify(value.value));
}
function conflict(id: ShortcutId, binding: KeyBinding) {
  return (
    shortcutIds.find((other) => other !== id && sameBinding(value.value.bindings[other], binding)) ??
    value.value.alternates.find((row) => sameBinding(row.binding, binding))?.action
  );
}
export const shortcuts = {
  value: readonly(value),
  load() {
    try {
      value.value = readShortcuts(JSON.parse(platform('storage').get(storageKey) || 'null'));
    } catch {
      value.value = defaultShortcuts();
    }
  },
  conflict,
  setBinding(id: ShortcutId, binding: KeyBinding | null) {
    if (binding && (!validBinding(binding, id) || conflict(id, binding))) return false;
    replace({ ...value.value, bindings: { ...value.value.bindings, [id]: binding } });
    return true;
  },
  setBrowserBlocked(id: BrowserShortcut, blocked: boolean) {
    replace({ ...value.value, blockedBrowser: { ...value.value.blockedBrowser, [id]: blocked } });
  },
  setNavigation(navigation: DeepReadonly<NavigationPreferences>) {
    replace({ ...value.value, navigation });
  },
  reset() {
    replace(defaultShortcuts());
  },
  restore: replace,
};
