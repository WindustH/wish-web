/** Platform-neutral shortcut definitions. Mod means Ctrl on PCs or Command on Macs. */
export const defaultBindings = {
  toggleRightSidebar: { key: 'Tab' },
  toggleLeftSidebar: { key: 'Tab', shift: true },
  searchSessions: { key: 'k', mod: true },
  searchChat: { key: 'f', mod: true, shift: true },
  openSettings: { key: ',', mod: true },
  newSession: { key: 'o', mod: true, shift: true },
  quickSwitchSessions: { key: ' ', mod: true },
} satisfies Record<string, KeyBinding>;
export type ShortcutId = keyof typeof defaultBindings;
export interface KeyBinding {
  key: string;
  mod?: boolean;
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
export interface ShortcutPreferences {
  bindings: Bindings;
  blockedBrowser: Record<BrowserShortcut, boolean>;
}
export const defaultShortcuts = (): ShortcutPreferences => ({
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
    mod: event.ctrlKey || event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}
export function sameBinding(a: KeyBinding | null, b: KeyBinding | null): boolean {
  return (
    a === b || (!!a && !!b && a.key === b.key && !!a.mod === !!b.mod && !!a.alt === !!b.alt && !!a.shift === !!b.shift)
  );
}
export function validBinding(value: unknown): value is KeyBinding {
  if (!value || typeof value !== 'object') return false;
  const binding = value as KeyBinding;
  if (
    typeof binding.key !== 'string' ||
    ![binding.mod, binding.alt, binding.shift].every((v) => v === undefined || typeof v === 'boolean')
  )
    return false;
  return (
    /^(Tab|F(?:[1-9]|1[0-2]))$/.test(binding.key) ||
    (!!(binding.mod || binding.alt) &&
      (binding.key.length === 1 ||
        /^(Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/.test(binding.key)))
  );
}
export function shortcutLabel(binding: KeyBinding): string {
  return [
    binding.mod && 'Ctrl / ⌘',
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
    const binding = stored.bindings?.[id];
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
  return result;
}
