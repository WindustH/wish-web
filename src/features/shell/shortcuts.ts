import {
  browserShortcutKeys,
  keyBinding,
  sameBinding,
  shortcutIds,
  type BrowserShortcut,
  type ShortcutId,
} from '../../core/shortcuts.ts';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';

export interface ShortcutCommands {
  openNewSession: () => void;
  openSettings: () => void;
  focusSessionSearch: () => Promise<void>;
  canSearchChat: () => boolean;
  focusChatSearch: () => Promise<void>;
  sidebarToggle: (side: 'left' | 'right') => (() => void) | null;
}
export function installShortcuts(commands: ShortcutCommands) {
  const browserBlocked = new WeakSet<KeyboardEvent>();
  const localKey = (event: KeyboardEvent) =>
    (event.defaultPrevented && !browserBlocked.has(event)) ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.composedPath().some((node) => node instanceof HTMLElement && node.hasAttribute('data-keyboard-boundary'));
  function action(id: ShortcutId) {
    switch (id) {
      case 'toggleRightSidebar':
        return commands.sidebarToggle('right');
      case 'toggleLeftSidebar':
        return commands.sidebarToggle('left');
      case 'searchSessions':
        return commands.focusSessionSearch;
      case 'searchChat':
        return commands.canSearchChat() ? commands.focusChatSearch : null;
      case 'openSettings':
        return commands.openSettings;
      case 'newSession':
        return commands.openNewSession;
    }
  }
  function command(event: KeyboardEvent) {
    if (localKey(event)) return;
    // Plain keys retain editing and dialog focus navigation. Docked and overlay
    // sidebars remain toggleable after their controls receive focus.
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event
        .composedPath()
        .some(
          (node) =>
            node instanceof HTMLElement &&
            (node.isContentEditable ||
              node.matches(
                'input, textarea, select, [role="textbox"], [role="combobox"], [role="dialog"]:not(.island-sidebar), [role="alertdialog"], [role="menu"], [role="listbox"]',
              )),
        )
    )
      return;
    const binding = keyBinding(event);
    const id = shortcutIds.find((key) => sameBinding(shortcuts.value.value.bindings[key], binding));
    const run = id && action(id);
    if (!run) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) void run();
  }
  function capture(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    // These browser commands stay blocked even inside an editor or local dialog.
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      (Object.keys(browserShortcutKeys) as BrowserShortcut[]).some(
        (id) => shortcuts.value.value.blockedBrowser[id] && browserShortcutKeys[id] === event.key.toLowerCase(),
      )
    ) {
      if (!event.defaultPrevented) browserBlocked.add(event);
      event.preventDefault();
    }
    // Tab runs before a sidebar's focus scope; other bindings allow local editors
    // to handle their own commands first.
    if (event.key === 'Tab') command(event);
  }
  document.addEventListener('keydown', capture, true);
  document.addEventListener('keydown', command);
  return () => {
    document.removeEventListener('keydown', capture, true);
    document.removeEventListener('keydown', command);
  };
}
