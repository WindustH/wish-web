import { browserShortcut, keyBinding, shortcutAction, type ShortcutId } from '../../core/shortcuts.ts';
import { browserBlockedKeys as browserBlocked } from '../../ui/shortcutEvents.ts';
import { navigateOverlay } from '../../ui/keyboardNavigation.ts';
import { trackTabCapture } from '../../ui/tabShortcutCapture.ts';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';

export interface ShortcutCommands {
  navigateWorkspace?: (event: KeyboardEvent) => boolean;
  quickSwitchSessions?: () => void;
  interruptReply?: () => void;
  openNewSession: () => void;
  openSettings: () => void;
  focusSessionSearch: () => Promise<void>;
  canSearchChat: () => boolean;
  focusChatSearch: () => Promise<void>;
  sidebarToggle: (side: 'left' | 'right') => (() => void) | null;
}
export function installShortcuts(commands: ShortcutCommands) {
  const stopTabCapture = trackTabCapture();
  const localKey = (event: KeyboardEvent, physicalSpace = false, palette = false) =>
    (event.defaultPrevented && !browserBlocked.has(event)) ||
    (!physicalSpace && (event.isComposing || event.keyCode === 229)) ||
    event
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement &&
          node.hasAttribute('data-keyboard-boundary') &&
          !(palette && node.classList.contains('session-quick-switch')),
      );
  function action(id: ShortcutId) {
    switch (id) {
      case 'toggleRightSidebar':
        return commands.sidebarToggle('right');
      case 'toggleLeftSidebar':
        return commands.sidebarToggle('left');
      case 'quickSwitchSessions':
        return commands.quickSwitchSessions;
      case 'interruptReply':
        return commands.interruptReply;
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
  function command(event: KeyboardEvent, physicalSpace = false, palette = false) {
    if (localKey(event, physicalSpace, palette)) return;
    // Function-key shortcuts also work in editors; they do not insert text.
    // Plain keys retain editing and dialog focus navigation. Docked and overlay
    // sidebars remain toggleable after their controls receive focus.
    if (
      !/^F(?:[1-9]|1[0-2])$/.test(event.key) &&
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
    if (physicalSpace) binding.key = ' ';
    const id = shortcutAction(shortcuts.value.value, binding);
    const run = id && action(id);
    if (!run) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) void run();
  }
  function capture(event: KeyboardEvent) {
    if (commands.navigateWorkspace?.(event)) return;
    if (event.composedPath().some((node) => node instanceof HTMLElement && node.hasAttribute('data-terminal-input'))) {
      // Terminal input handlers get the key first; cancel the browser action after it bubbles.
      return;
    }
    if (navigateOverlay(event, shortcuts.value.value.navigation)) return;
    // These browser commands stay blocked even inside an editor or local dialog.
    const browserCommand = browserShortcut(event);
    if (browserCommand && shortcuts.value.value.blockedBrowser[browserCommand]) {
      if (!event.defaultPrevented) browserBlocked.add(event);
      event.preventDefault();
    }
    // Ctrl+Space can arrive as Process/229 through an IME. This explicit
    // modified shortcut is safe to identify by its physical key; ordinary Space
    // still belongs to composition. Run the palette before editor handlers.
    const physicalSpace = event.code === 'Space' && (event.ctrlKey || event.metaKey);
    const binding = keyBinding(event);
    if (physicalSpace) binding.key = ' ';
    if (shortcutAction(shortcuts.value.value, binding) === 'quickSwitchSessions') {
      command(event, physicalSpace, true);
      return;
    }
    // Tab runs before a sidebar's focus scope; other bindings allow local editors
    // to handle their own commands first.
    if (event.key === 'Tab') command(event);
  }
  function terminalTabKey(event: KeyboardEvent) {
    if (!event.composedPath().some((node) => node instanceof HTMLElement && node.hasAttribute('data-terminal-input')))
      return;
    const id = browserShortcut(event);
    if ((id === 'closeTab' || id === 'newTab') && shortcuts.value.value.blockedBrowser[id]) event.preventDefault();
  }
  window.addEventListener('keydown', terminalTabKey);
  window.addEventListener('keydown', capture, true);
  document.addEventListener('keydown', command);
  return () => {
    window.removeEventListener('keydown', terminalTabKey);
    window.removeEventListener('keydown', capture, true);
    document.removeEventListener('keydown', command);
    stopTabCapture();
  };
}
