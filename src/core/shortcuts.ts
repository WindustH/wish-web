/** Shortcut modifiers are literal: Control and Meta are separate keys. */
export const defaultBindings = {
  toggleRightSidebar: { key: 'Tab' },
  toggleLeftSidebar: { key: 'Tab', shift: true },
  searchSessions: { key: 'k', ctrl: true },
  searchChat: { key: 'f', ctrl: true, shift: true },
  openSettings: { key: ',', ctrl: true },
  newSession: { key: 'o', ctrl: true, shift: true },
  quickSwitchSessions: { key: 'F4' },
  interruptReply: { key: 'p', ctrl: true },
} satisfies Record<string, KeyBinding>;
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
export type BrowserShortcut = 'find' | 'print' | 'save' | 'devTools' | 'caretBrowsing';
export const browserShortcutKeys: Record<BrowserShortcut, string> = {
  find: 'f',
  print: 'p',
  save: 's',
  devTools: 'F12',
  caretBrowsing: 'F7',
};
export const navigationDefaults = {
  focus: 'i',
  exit: 'Escape',
  down: 'j',
  up: 'k',
  nextMessage: 'J',
  previousMessage: 'K',
  command: ':',
};
export type NavigationAction = keyof typeof navigationDefaults;
export interface NavigationPreferences {
  enabled: boolean;
  keys: Record<NavigationAction, string>;
  exitSequence: string;
  sequenceTimeout: number;
}
export const defaultNavigation = (): NavigationPreferences => ({
  enabled: true,
  keys: { ...navigationDefaults },
  exitSequence: '',
  sequenceTimeout: 300,
});
export function validNavigationKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    (key === '' || key === 'Escape' || /^[!-~]$/.test(key) || /^F(?:[1-9]|1[0-2])$/.test(key))
  );
}
export interface ShortcutPreferences {
  navigation: NavigationPreferences;
  bindings: Bindings;
  blockedBrowser: Record<BrowserShortcut, boolean>;
}
export const defaultShortcuts = (): ShortcutPreferences => ({
  navigation: defaultNavigation(),
  bindings: Object.fromEntries(shortcutIds.map((id) => [id, { ...defaultBindings[id] }])) as Bindings,
  blockedBrowser: { find: true, print: true, save: true, devTools: true, caretBrowsing: true },
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
    if (binding === null || validBinding(binding)) result.bindings[id] = binding;
  }
  // A malformed or manually edited value must not give two commands the same key.
  const used: KeyBinding[] = [];
  for (const id of shortcutIds) {
    const binding = result.bindings[id];
    if (!binding) continue;
    if (used.some((other) => sameBinding(other, binding))) result.bindings[id] = null;
    else used.push(binding);
  }
  for (const id of Object.keys(browserShortcutKeys) as BrowserShortcut[]) {
    const blocked = stored.blockedBrowser?.[id];
    if (typeof blocked === 'boolean') result.blockedBrowser[id] = blocked;
  }
  const nav = stored.navigation;
  if (nav && typeof nav === 'object') {
    if (typeof nav.enabled === 'boolean') result.navigation.enabled = nav.enabled;
    const seen = new Set<string>();
    for (const id of Object.keys(navigationDefaults) as NavigationAction[]) {
      const key = nav.keys?.[id];
      if (validNavigationKey(key)) result.navigation.keys[id] = key;
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
    const binding = {
      key: key.length === 1 ? key.toLowerCase() : key,
      shift: key.length === 1 && key.toLowerCase() !== key,
    };
    if (key && Object.values(result.bindings).some((other) => sameBinding(other, binding)))
      result.navigation.keys[id] = '';
  }
  return result;
}
