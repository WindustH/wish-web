export interface ShortcutCommands {
  openNewSession: () => void;
  openSettings: () => void;
  focusSessionSearch: () => Promise<void>;
  canSearchChat: () => boolean;
  focusChatSearch: () => Promise<void>;
}
export function installShortcuts(commands: ShortcutCommands) {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || !(event.ctrlKey || event.metaKey)) return;
    if (event.composedPath().some((node) => node instanceof HTMLElement && node.hasAttribute('data-keyboard-boundary')))
      return;
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
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
