import { nextTick } from 'vue';
import { isSidebarCycle, keyBinding, navigationAction, shortcutAction } from '../../core/shortcuts.ts';
import { shortcuts } from '../../core/state/shortcutsSlice.ts';
import { topSurface, scrollContainer } from '../../ui/keyboardNavigation.ts';

type Region = 'list' | 'chat' | 'side';
const items =
  '.sl-row,.library-item,.linked-child,.local-directory > button,.library-more,.task-open,[data-workspace-item]';
const visible = (el: HTMLElement) =>
  el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]');
function regionOf(element: Element | null): Region | undefined {
  return element?.closest<HTMLElement>('[data-workspace-region]')?.dataset.workspaceRegion as Region | undefined;
}
export function rememberWorkspaceFocus(event: Event) {
  const root = event.currentTarget as HTMLElement;
  const region = event.target instanceof Element && regionOf(event.target);
  if (region) root.dataset.focusRegion = region;
}
function panel(root: HTMLElement, region: Region) {
  return root.querySelector<HTMLElement>(
    `[data-workspace-region="${region}"]:not(.is-collapsed,.sheet-closed,[data-state="closed"])`,
  );
}
export function focusRegion(root: HTMLElement, region: Region) {
  const target = panel(root, region);
  if (!target) return;
  root.dataset.focusRegion = region;
  const terminal = target.querySelector<HTMLElement>('[data-terminal-input]');
  if (terminal && visible(terminal)) {
    terminal.focus({ preventScroll: true });
    terminal.dispatchEvent(new Event('workspace-focus'));
  } else {
    const item =
      region === 'chat' ? null : (target.querySelector<HTMLElement>('.sl-item.active .sl-row') ?? itemList(target)[0]);
    (item ?? target).focus({ preventScroll: true });
    item?.scrollIntoView({ block: 'nearest' });
  }
}
function itemList(region: HTMLElement) {
  return [...region.querySelectorAll<HTMLElement>(items)].filter((el) => !el.matches(':disabled') && visible(el));
}
export function navigateWorkspace(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;
  const prefs = shortcuts.value.value;
  const app = shortcutAction(prefs, keyBinding(event));
  const switchPane = app === 'focusRegionLeft' || app === 'focusRegionRight';
  const nav = prefs.navigation;
  const action = nav.enabled && !event.ctrlKey && !event.metaKey && !event.altKey && navigationAction(nav, event.key);
  if (!switchPane && (!action || action === 'command' || action === 'exit')) return false;
  const root = document.querySelector<HTMLElement>('.sessions-split[data-chat-navigation]');
  if (!root || !visible(root)) return false;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const surface = topSurface();
  if (surface && !surface.matches('.island-sheet,.island-drawer')) return false;
  if (event.target instanceof Element && event.target.closest('[data-navigation-ignore]')) return false;
  const remembered = root.dataset.focusRegion as Region;
  const here = surface?.matches('.island-sheet,.island-drawer')
    ? 'side'
    : (regionOf(active) ?? (remembered && panel(root, remembered) ? remembered : 'chat'));
  const current = panel(root, here);
  const consume = () => {
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  };
  if (isSidebarCycle(action)) {
    const protectedFocus =
      'input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox],[role=combobox],[data-terminal-input],[data-keyboard-boundary]';
    if (
      active?.closest(protectedFocus) ||
      event.composedPath().some((node) => node instanceof Element && node.matches(protectedFocus))
    )
      return false;
    const workspace = root.querySelector<HTMLElement>('.chat-workspace');
    if (!workspace) return false;
    if (!event.repeat)
      workspace.dispatchEvent(new CustomEvent('cycle-sidebar', { detail: action === 'nextSidebar' ? 1 : -1 }));
    return consume();
  }
  if (switchPane) {
    const order: Region[] = ['list', 'chat', 'side'];
    const next = order[order.indexOf(here) + (app === 'focusRegionLeft' ? -1 : 1)];
    if (!next) return consume();
    if (!event.repeat) {
      if (next === 'list' && !panel(root, 'list')) {
        const toggle = root.querySelector<HTMLButtonElement>('.session-list-toggle');
        if (!toggle) {
          root.dispatchEvent(new Event('workspace-open-list'));
          return consume();
        }
        toggle.click();
      }
      if (next === 'chat' && !panel(root, 'chat')) {
        root.dispatchEvent(new Event('workspace-return-chat'));
        return consume();
      }
      if (next === 'side' && !panel(root, 'side')) {
        const toggle = root.querySelector<HTMLButtonElement>('[data-sidebar-toggle]');
        if (!toggle) return false;
        toggle.click();
      }
      if (next === 'chat' && current?.matches('.island-drawer,.island-sheet'))
        root.querySelector<HTMLButtonElement>('[data-sidebar-toggle]')?.click();
      void nextTick(() => focusRegion(root, next));
    }
    return consume();
  }
  if (
    !current ||
    here === 'chat' ||
    !action ||
    active?.isContentEditable ||
    active?.closest(
      'input,textarea,select,[role="textbox"],[role="combobox"],[data-keyboard-boundary],[data-terminal-input]',
    )
  )
    return false;
  if (action === 'back') {
    if (!event.repeat) {
      if (here === 'side') current.dispatchEvent(new Event('workspace-back'));
      else {
        const up =
          current.querySelector<HTMLButtonElement>('.sl-select-bar button') ??
          current.querySelector<HTMLButtonElement>('.sl-up');
        if (up) up.click();
        else if (panel(root, 'chat')) focusRegion(root, 'chat');
        else root.dispatchEvent(new Event('workspace-return-chat'));
      }
    }
    return consume();
  }
  if (action === 'focus') {
    Array.from(
      current.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not(:disabled),textarea:not(:disabled)'),
    )
      .find(visible)
      ?.focus();
    return consume();
  }
  const rows = itemList(current);
  const index = active ? rows.indexOf(active) : -1;
  if (action === 'openItem') {
    if (active && current.contains(active) && index < 0 && active.closest('button,a,[role="tab"]')) return false;
    if (index < 0) return false;
    if (!event.repeat) rows[index].click();
  } else {
    const down = action === 'down' || action === 'nextMessage';
    const page = action === 'nextMessage' || action === 'previousMessage';
    if (!page && rows.length) {
      const item = rows[Math.max(0, Math.min(rows.length - 1, index < 0 ? 0 : index + (down ? 1 : -1)))];
      item.focus({ preventScroll: true });
      item.scrollIntoView({ block: 'nearest' });
    } else {
      const scroller = scrollContainer(current);
      if (scroller)
        scroller.scrollBy({ top: (down ? 1 : -1) * (page ? scroller.clientHeight * 0.85 : 64), behavior: 'instant' });
    }
  }
  return consume();
}
