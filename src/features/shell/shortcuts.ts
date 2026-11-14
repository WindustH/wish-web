export interface ShortcutCommands {
  openNewSession: () => void;
  openSettings: () => void;
  focusSessionSearch: () => Promise<void>;
  canSearchChat: () => boolean;
  focusChatSearch: () => Promise<void>;
  sidebarToggle: (side: 'left' | 'right') => (() => void) | null;
}
export function installShortcuts(commands: ShortcutCommands) {
  const localKey = (event: KeyboardEvent) =>
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.composedPath().some((node) => node instanceof HTMLElement && node.hasAttribute('data-keyboard-boundary'));
  const onTab = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey || localKey(event)) return;
    const path = event.composedPath();
    // Editors and local surfaces keep their own focus order and key handling.
    if (
      path.some(
        (node) =>
          node instanceof HTMLElement &&
          (node.isContentEditable ||
            node.matches(
              'input, textarea, select, button, a[href], summary, audio[controls], video[controls], [tabindex]:not([tabindex="-1"]), [role="button"], [role="textbox"], [role="combobox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
            )),
      )
    )
      return;
    const toggle = commands.sidebarToggle(event.shiftKey ? 'left' : 'right');
    if (!toggle) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) toggle();
  };
  const onKey = (event: KeyboardEvent) => {
    if (localKey(event) || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const action =
      key === 'k'
        ? commands.focusSessionSearch
        : key === 'f' && event.shiftKey && commands.canSearchChat()
          ? commands.focusChatSearch
          : key === ','
            ? commands.openSettings
            : key === 'o' && event.shiftKey
              ? commands.openNewSession
              : null;
    if (!action) return;
    event.preventDefault();
    void action();
  };
  // Only background focus uses Tab as a sidebar shortcut; local controls keep native traversal.
  document.addEventListener('keydown', onTab, true);
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onTab, true);
    document.removeEventListener('keydown', onKey);
  };
}
