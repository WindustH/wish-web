import type { DeepReadonly } from 'vue';
import { isSidebarCycle, navigationAction, type NavigationPreferences } from '../core/shortcuts.ts';
import { backLayers } from './backLayers.ts';

const surfaces =
  '[role="dialog"]:not(.island-sidebar),.island-sheet,[role="alertdialog"],[role="menu"],[role="listbox"]';
const forwarded = new WeakSet<KeyboardEvent>();
const editing = (node: EventTarget | null) =>
  node instanceof HTMLElement && (node.isContentEditable || node.matches('input,textarea,select,[role="textbox"]'));
const visible = (node: HTMLElement) =>
  node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';

function layer(node: HTMLElement) {
  let z = 0;
  for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) {
    z = Math.max(z, Number(getComputedStyle(parent).zIndex) || 0);
  }
  return z;
}

export function topSurface() {
  return (
    [...document.querySelectorAll<HTMLElement>(surfaces)]
      .filter(visible)
      // A command panel's inline list belongs to its dialog; portalled menus/selects
      // are independent surfaces. Keep the last DOM sibling when priorities tie.
      .filter(
        (node) =>
          !node.matches('[role="listbox"]') ||
          node.hasAttribute('data-keyboard-boundary') ||
          !node.parentElement?.closest(surfaces),
      )
      .sort((a, b) => layer(a) - layer(b))
      .at(-1)
  );
}

function forward(target: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
  forwarded.add(event);
  target.dispatchEvent(event);
}

export function scrollContainer(surface: HTMLElement) {
  const scrollable = (node: HTMLElement) =>
    visible(node) && node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY);
  // Prefer the focused pane (e.g. a two-column picker), then the main reading area.
  for (
    let node = document.activeElement as HTMLElement | null;
    node && surface.contains(node);
    node = node.parentElement
  ) {
    if (scrollable(node)) return node;
  }
  return [surface, ...surface.querySelectorAll<HTMLElement>('*')]
    .filter(scrollable)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
}

/** Own single-key navigation before chat shortcuts, while preserving text and terminal input. */
export function navigateOverlay(event: KeyboardEvent, navigation: DeepReadonly<NavigationPreferences>): boolean {
  if (
    !navigation.enabled ||
    forwarded.has(event) ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return false;
  const action = navigationAction(navigation, event.key);
  if (!action || isSidebarCycle(action) || action === 'openItem' || action === 'exit' || action === 'command')
    return false;
  const path = event.composedPath();
  if (
    editing(document.activeElement) ||
    path.some(editing) ||
    path.some((node) => node instanceof HTMLElement && node.matches('[data-navigation-ignore],[data-terminal-input]'))
  )
    return false;
  const surface =
    topSurface() ??
    (action === 'back' && document.activeElement instanceof HTMLElement
      ? (document.activeElement.closest<HTMLElement>('.island-sidebar') ?? undefined)
      : undefined);
  if (!surface && action !== 'back') return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (surface?.dataset.state === 'closed') return true;
  // Do not let a held q dismiss several windows or traverse several pages.
  if (action === 'back') {
    if (!event.repeat) {
      if (!surface || surface.hasAttribute('data-navigation-page')) backLayers()?.keyboardBack(!!surface);
      else
        forward(
          surface,
          surface.hasAttribute('data-navigation-submenu')
            ? getComputedStyle(surface).direction === 'rtl'
              ? 'ArrowRight'
              : 'ArrowLeft'
            : 'Escape',
        );
    }
    return true;
  }
  if (!surface) return true;
  if (action === 'focus') {
    if (!event.repeat)
      [
        ...surface.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not(:disabled):not([readonly]),textarea:not(:disabled):not([readonly]),[contenteditable="true"]',
        ),
      ]
        .find(visible)
        ?.focus();
    return true;
  }
  const down = action === 'down' || action === 'nextMessage';
  const page = action === 'nextMessage' || action === 'previousMessage';
  const list = surface.matches('[role="menu"],[role="listbox"]')
    ? surface
    : surface.querySelector<HTMLElement>('[role="listbox"]');
  if (list && visible(list) && !page) {
    // Use the widget's own option navigation, disabled-item skipping and selection.
    // Search-backed command pickers handle arrows on their search field.
    const active = document.activeElement;
    const target = surface.matches('[role="menu"],[role="listbox"]')
      ? active instanceof HTMLElement && surface.contains(active)
        ? active
        : surface
      : (surface.querySelector<HTMLElement>('input') ?? list);
    forward(target, down ? 'ArrowDown' : 'ArrowUp');
  } else {
    const container = scrollContainer(surface);
    if (container)
      container.scrollBy({ top: (down ? 1 : -1) * (page ? container.clientHeight * 0.85 : 64), behavior: 'instant' });
  }
  return true;
}
