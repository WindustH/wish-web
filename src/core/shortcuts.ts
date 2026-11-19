import type { DeepReadonly } from 'vue';

/** Shortcut modifiers are literal: Control and Meta are separate keys. */
export const defaultBindings = {
  toggleRightSidebar: { key: 'Tab' },
  focusRegionLeft: { key: 'h', ctrl: true, shift: true },
  focusRegionRight: { key: 'l', ctrl: true, shift: true },
  toggleLeftSidebar: { key: 'Tab', shift: true },
  searchSessions: null,
  searchChat: null,
  openSettings: { key: ',', ctrl: true },
  newSession: { key: 'o', ctrl: true, shift: true },
  quickSwitchSessions: { key: 'F4' },
  interruptReply: { key: 'p', ctrl: true },
} satisfies Record<string, KeyBinding | null>;
export type ShortcutId = keyof typeof defaultBindings;
export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
}
export type Bindings = Record<ShortcutId, KeyBinding | null>;
export const shortcutIds = Object.keys(defaultBindings) as ShortcutId[];
export type BrowserShortcut = 'find' | 'print' | 'save' | 'devTools' | 'caretBrowsing' | 'closeTab' | 'newTab';
export const browserShortcutKeys: Record<BrowserShortcut, string> = {
  find: 'f',
  print: 'p',
  save: 's',
  devTools: 'F12',
  caretBrowsing: 'F7',
  closeTab: 'w',
  newTab: 't',
};
export const navigationDefaults = {
  focus: 'i',
  exit: 'Escape',
  down: 'j',
  up: 'k',
  nextMessage: 'J',
  previousMessage: 'K',
  command: ':',
  back: 'q',
  openItem: 'o',
  previousSidebar: '[',
  nextSidebar: ']',
};
export type NavigationAction = keyof typeof navigationDefaults;
export const isSidebarCycle = (action: NavigationAction | undefined | false) =>
  action === 'previousSidebar' || action === 'nextSidebar';
export interface NavigationPreferences {
  enabled: boolean;
  indicator: boolean;
  alternates: { action: NavigationAction; key: string }[];
  keys: Record<NavigationAction, string>;
  exitSequence: string;
  sequenceTimeout: number;
}
export const defaultNavigation = (): NavigationPreferences => ({
  enabled: true,
  indicator: false,
  alternates: [{ action: 'openItem', key: 'Enter' }],
  keys: { ...navigationDefaults },
  exitSequence: '',
  sequenceTimeout: 300,
});
export function validNavigationKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    (key === '' || key === 'Escape' || key === 'Enter' || /^[!-~]$/.test(key) || /^F(?:[1-9]|1[0-2])$/.test(key))
  );
}
export interface ShortcutPreferences {
  version: 2;
  navigation: NavigationPreferences;
  bindings: Bindings;
  alternates: { action: ShortcutId; binding: KeyBinding }[];
  blockedBrowser: Record<BrowserShortcut, boolean>;
}
export const defaultShortcuts = (): ShortcutPreferences => ({
  version: 2,
  navigation: defaultNavigation(),
  alternates: [],
  bindings: Object.fromEntries(
    shortcutIds.map((id) => [id, defaultBindings[id] && { ...defaultBindings[id] }]),
  ) as Bindings,
  blockedBrowser: {
    find: true,
    print: true,
    save: true,
    devTools: true,
    caretBrowsing: true,
    closeTab: true,
    newTab: true,
  },
});
export function browserShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): BrowserShortcut | undefined {
  // An IME may replace key with Process/Unidentified while leaving the physical
  // key available. Blocking browser actions must still work during composition.
  const key = ['Process', 'Unidentified', ''].includes(event.key) ? event.code.replace(/^Key/, '') : event.key;
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    if (key === 'F3') return 'find'; // Shift reverses the search direction.
    if (!event.shiftKey) {
      if (key === 'F7') return 'caretBrowsing';
      if (key === 'F12') return 'devTools';
    }
  }
  const letter = key.toLowerCase();
  if (letter === 'w' || letter === 't') {
    if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
      return letter === 'w' ? 'closeTab' : 'newTab';
    return;
  }
  const devToolsModifier =
    (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey) ||
    (event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey);
  if (devToolsModifier && ['i', 'j', 'c'].includes(letter)) return 'devTools';
  if ((event.ctrlKey || event.metaKey) && !event.altKey && letter === 'g') return 'find';
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  return (Object.keys(browserShortcutKeys) as BrowserShortcut[]).find((id) => browserShortcutKeys[id] === letter);
}
export function keyBinding(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): KeyBinding {
  return {
    key: event.key.length === 1 ? event.key.toLowerCase() : event.key,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}
export function sameBinding(a: KeyBinding | null, b: KeyBinding | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.key === b.key &&
      !!a.ctrl === !!b.ctrl &&
      !!a.meta === !!b.meta &&
      !!a.alt === !!b.alt &&
      !!a.shift === !!b.shift)
  );
}
export function validBinding(value: unknown): value is KeyBinding {
  if (!value || typeof value !== 'object') return false;
  const binding = value as KeyBinding;
  if (
    typeof binding.key !== 'string' ||
    'mod' in binding ||
    ![binding.ctrl, binding.meta, binding.alt, binding.shift].every((v) => v === undefined || typeof v === 'boolean')
  )
    return false;
  return (
    /^(Tab|F(?:[1-9]|1[0-2]))$/.test(binding.key) ||
    (!!(binding.ctrl || binding.meta || binding.alt) &&
      (binding.key.length === 1 ||
        /^(Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/.test(binding.key)))
  );
}
export function shortcutLabel(binding: KeyBinding): string {
  return [
    binding.ctrl && 'Ctrl',
    binding.meta && '⌘',
    binding.alt && 'Alt',
    binding.shift && 'Shift',
    binding.key.length === 1 ? (binding.key === ' ' ? 'Space' : binding.key.toUpperCase()) : binding.key,
  ]
    .filter(Boolean)
    .join(' + ');
}
export function navigationAction(nav: DeepReadonly<NavigationPreferences>, key: string): NavigationAction | undefined {
  if (!key) return;
  return (
    (Object.keys(nav.keys) as NavigationAction[]).find((id) => nav.keys[id] === key) ??
    nav.alternates.find((row) => row.key === key)?.action
  );
}
export function shortcutAction(prefs: DeepReadonly<ShortcutPreferences>, binding: KeyBinding): ShortcutId | undefined {
  return (
    shortcutIds.find((id) => sameBinding(prefs.bindings[id], binding)) ??
    prefs.alternates.find((row) => sameBinding(row.binding, binding))?.action
  );
}
export function navigationBinding(key: string): KeyBinding {
  return { key: key.length === 1 ? key.toLowerCase() : key, shift: key.length === 1 && key.toLowerCase() !== key };
}
export function readShortcuts(value: unknown): ShortcutPreferences {
  const result = defaultShortcuts();
  if (!value || typeof value !== 'object') return result;
  const stored = value as Partial<ShortcutPreferences>;
  for (const id of shortcutIds) {
    let binding: unknown = stored.bindings?.[id];
    // Older preferences merged Control and Meta into `mod` and cannot recover
    // which physical key was recorded. Migrate that legacy modifier to Control;
    // explicit bindings in the new format always retain their own modifiers.
    if (binding && typeof binding === 'object' && 'mod' in binding) {
      const { mod, ...rest } = binding as Record<string, unknown>;
      if (typeof mod !== 'boolean') continue;
      binding = 'ctrl' in rest || 'meta' in rest ? rest : { ...rest, ctrl: mod };
    }
    if (binding === null || validBinding(binding)) {
      // Legacy versions saved the entire defaults table, even for untouched actions.
      const oldSearch =
        id === 'searchSessions'
          ? { key: 'k', ctrl: true }
          : id === 'searchChat'
            ? { key: 'f', ctrl: true, shift: true }
            : null;
      result.bindings[id] = stored.version !== 2 && oldSearch && sameBinding(binding, oldSearch) ? null : binding;
    }
  }
  // A malformed or manually edited value must not give two commands the same key.
  const used: KeyBinding[] = [];
  const priority = shortcutIds
    .slice()
    .sort((a, b) => Number(stored.bindings?.[b] !== undefined) - Number(stored.bindings?.[a] !== undefined));
  for (const id of priority) {
    const binding = result.bindings[id];
    if (!binding) continue;
    if (used.some((other) => sameBinding(other, binding))) result.bindings[id] = null;
    else used.push(binding);
  }
  if (Array.isArray(stored.alternates)) {
    for (const row of stored.alternates) {
      if (row && shortcutIds.includes(row.action) && validBinding(row.binding) && !shortcutAction(result, row.binding))
        result.alternates.push({ action: row.action, binding: row.binding });
    }
  }
  for (const id of Object.keys(browserShortcutKeys) as BrowserShortcut[]) {
    const blocked = stored.blockedBrowser?.[id];
    if (typeof blocked === 'boolean') result.blockedBrowser[id] = blocked;
  }
  const nav = stored.navigation;
  if (nav && typeof nav === 'object') {
    if (typeof nav.enabled === 'boolean') result.navigation.enabled = nav.enabled;
    if (typeof nav.indicator === 'boolean') result.navigation.indicator = nav.indicator;
    const seen = new Set<string>();
    for (const id of Object.keys(navigationDefaults) as NavigationAction[]) {
      const key = nav.keys?.[id];
      if (validNavigationKey(key)) result.navigation.keys[id] = key;
      else if (
        isSidebarCycle(id) &&
        Array.isArray(nav.alternates) &&
        nav.alternates.some(
          (row) => row?.key === navigationDefaults[id] && Object.hasOwn(navigationDefaults, row.action),
        )
      )
        result.navigation.keys[id] = '';
      const next = result.navigation.keys[id];
      if (next && seen.has(next)) result.navigation.keys[id] = '';
      else seen.add(next);
    }
    if (typeof nav.exitSequence === 'string' && (nav.exitSequence === '' || /^[!-~]{2,6}$/.test(nav.exitSequence)))
      result.navigation.exitSequence = nav.exitSequence;
    if (typeof nav.sequenceTimeout === 'number' && Number.isFinite(nav.sequenceTimeout))
      result.navigation.sequenceTimeout = Math.max(100, Math.min(2000, Math.round(nav.sequenceTimeout)));
  }
  for (const id of Object.keys(navigationDefaults) as NavigationAction[]) {
    const key = result.navigation.keys[id];
    if (key && shortcutAction(result, navigationBinding(key))) result.navigation.keys[id] = '';
  }
  const aliases = Array.isArray(nav?.alternates) ? nav.alternates : result.navigation.alternates;
  result.navigation.alternates = [];
  for (const row of aliases) {
    if (
      row &&
      Object.hasOwn(navigationDefaults, row.action) &&
      row.key &&
      validNavigationKey(row.key) &&
      !navigationAction(result.navigation, row.key) &&
      !shortcutAction(result, navigationBinding(row.key))
    )
      result.navigation.alternates.push({ action: row.action, key: row.key });
  }
  return result;
}
