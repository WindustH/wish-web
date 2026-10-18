// Gestures that should have done something and did not, kept for the debug page: a swipe that
// scrolled nothing under it, and a tap that made no click. A page that now and then stops answering
// is easier to read from what was on it at that moment than to guess at: what the finger landed on,
// what lay over it, and whether the page's own listeners cancelled or stopped the events.
import { ref } from 'vue';

export interface ScrollStall {
  at: string;
  kind: 'touch' | 'wheel' | 'tap';
  route: string;
  /** What the gesture landed on, and the list under it that could have scrolled. */
  target: string;
  scroller: string;
  /** The topmost element at the point, when it is not part of the list: what covered it. */
  coveredBy?: string;
  touchAction?: string;
  /** Moves cancelled by the page's listeners, moves stopped before reaching the window, and all moves. */
  moves?: string;
  /** For a tap: whether a click came at all, whether a listener on the way stopped it, and which. */
  click?: string;
  swallowedBy?: string;
  /** The list's scrollTop / scrollHeight / clientHeight. */
  scroll: string;
  page: string;
  /** Backdrops, overlays, dialogs and inert parts shown on the page. */
  layers: string[];
}

const KEY = 'debug.scroll-stalls';
const KEEP = 20;
export const stalls = ref<ScrollStall[]>(read());

function read(): ScrollStall[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function keep(stall: ScrollStall) {
  stalls.value = [stall, ...stalls.value].slice(0, KEEP);
  try { localStorage.setItem(KEY, JSON.stringify(stalls.value)); } catch { /* kept for this visit only */ }
}
export function clearStalls() {
  stalls.value = [];
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
}

// An element as a short selector, with two of its ancestors.
function describe(element: Element | null | undefined): string {
  const parts: string[] = [];
  for (let node = element; node && parts.length < 3 && node !== document.body; node = node.parentElement) {
    const classes = [...node.classList].slice(0, 3).map(name => `.${name}`).join('');
    parts.push(`${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${classes}`);
  }
  return parts.join(' < ') || String(element?.nodeName ?? 'nothing');
}
// The list under a point that has something to scroll, looking through whatever lies over it.
function scrollerAt(x: number, y: number): HTMLElement | null {
  for (const element of document.elementsFromPoint(x, y)) {
    for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    }
  }
  return null;
}
// Whether the list has room to move its content up (toward > 0) or down.
const canScroll = (list: HTMLElement, toward: number) => toward > 0 ? list.scrollTop + list.clientHeight < list.scrollHeight - 1 : list.scrollTop > 0;
function layers(): string[] {
  const found: string[] = [];
  for (const [selector, name] of [
    ['.menu-backdrop', 'menu backdrop'], ['.modal-overlay, .settings-overlay, .overlay-window-scrim', 'overlay'],
    ['[data-reka-popper-content-wrapper]', 'popper'], ['[role="dialog"]', 'dialog'], ['[inert]', 'inert'], ['.ts-handle', 'selection handle'],
  ]) {
    const count = [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length).length;
    if (count) found.push(`${name} ×${count}`);
  }
  return found;
}
function record(kind: ScrollStall['kind'], x: number, y: number, target: Element | null, list: HTMLElement | null, extra: Partial<ScrollStall> = {}) {
  const top = document.elementFromPoint(x, y);
  keep({
    at: new Date().toISOString(),
    kind,
    route: location.hash || location.pathname,
    target: describe(target),
    scroller: list ? describe(list) : '',
    coveredBy: top && !(list ?? target)?.contains(top) ? describe(top) : undefined,
    touchAction: target instanceof Element ? getComputedStyle(target).touchAction : undefined,
    ...extra,
    scroll: list ? `${Math.round(list.scrollTop)} / ${list.scrollHeight} / ${list.clientHeight}` : '',
    page: `body{${document.body.getAttribute('style') ?? ''}} html.${[...document.documentElement.classList].join('.')}`,
    layers: layers(),
  });
}

let scrolledAt = 0;
type Touch = { x: number; y: number; dy: number; at: number; moves: number; seen: number; cancelled: number; target: Element | null; menu: boolean };
let touch: Touch | undefined;
let wheelPending = false;
let lastRecord = 0;
// A menu in sight takes the next press only to close; that press scrolling nothing is no stall.
const menuInSight = () => [...document.querySelectorAll('.menu-pop, [role="dialog"]')].some(element => {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth && getComputedStyle(element).visibility === 'visible';
});

// A tap on something that answers taps should make a click: one seen first of all, by the window as
// it comes down, and again last of all, as it goes back up. Seen only coming down, a listener on the
// way stopped it; not seen at all, nothing took the tap as one.
let clickDown = 0, clickUp = 0;
let swallowed: { by: string; at: number } | undefined;
/** Called by the page's own listeners that keep a click from what it landed on, saying why. */
export function noteSwallowedClick(by: string) { swallowed = { by, at: performance.now() }; }
const ANSWERS = 'a, button, [role="button"], [role="option"], [role="menuitem"], input, label, summary, .sl-item';
function watchTap(gesture: Touch) {
  const target = gesture.target instanceof Element ? gesture.target.closest(ANSWERS) : null;
  if (!target) return;
  const tappedAt = performance.now();
  setTimeout(() => {
    if (clickUp > tappedAt || performance.now() - lastRecord < 2000) return;
    lastRecord = performance.now();
    record('tap', gesture.x, gesture.y, gesture.target, null, {
      click: clickDown > tappedAt ? 'stopped on the way' : 'none came',
      swallowedBy: swallowed && swallowed.at > tappedAt - 50 ? swallowed.by : undefined,
    });
  }, 350);
}

/** Starts keeping stalls; every listener is passive and only reads. */
export function installScrollStallLog() {
  window.addEventListener('click', () => { clickDown = performance.now(); }, { capture: true, passive: true });
  window.addEventListener('click', () => { clickUp = performance.now(); }, { passive: true });
  document.addEventListener('scroll', () => { scrolledAt = performance.now(); }, { capture: true, passive: true });
  window.addEventListener('touchstart', event => {
    const point = event.touches[0];
    touch = event.touches.length === 1 && point
      ? { x: point.clientX, y: point.clientY, dy: 0, at: performance.now(), moves: 0, seen: 0, cancelled: 0, target: event.target as Element, menu: menuInSight() }
      : undefined;
  }, { capture: true, passive: true });
  // First of all, every move; last of all, whether the page's listeners cancelled it.
  window.addEventListener('touchmove', event => {
    const point = event.touches[0];
    if (!touch || !point) return;
    touch.moves++;
    touch.dy = point.clientY - touch.y;
  }, { capture: true, passive: true });
  window.addEventListener('touchmove', event => {
    if (!touch) return;
    touch.seen++;
    if (event.defaultPrevented) touch.cancelled++;
  }, { passive: true });
  window.addEventListener('touchend', () => {
    const gesture = touch;
    touch = undefined;
    if (gesture && !gesture.menu && !gesture.moves && performance.now() - gesture.at < 500) watchTap(gesture);
    if (!gesture || gesture.menu || Math.abs(gesture.dy) < 48) return;
    // A scroll that did happen has fired by the next frames.
    setTimeout(() => {
      if (scrolledAt > gesture.at || performance.now() - lastRecord < 2000) return;
      const list = scrollerAt(gesture.x, gesture.y);
      if (!list || !canScroll(list, -gesture.dy)) return;
      lastRecord = performance.now();
      record('touch', gesture.x, gesture.y, gesture.target, list, { moves: `${gesture.cancelled} cancelled, ${gesture.moves - gesture.seen} stopped, of ${gesture.moves}` });
    }, 150);
  }, { passive: true });
  window.addEventListener('wheel', event => {
    if (wheelPending || !event.deltaY || menuInSight()) return;
    const list = scrollerAt(event.clientX, event.clientY);
    if (!list || !canScroll(list, event.deltaY)) return;
    wheelPending = true;
    const at = performance.now(), top = list.scrollTop, x = event.clientX, y = event.clientY, target = event.target as Element;
    setTimeout(() => {
      wheelPending = false;
      if (scrolledAt > at || list.scrollTop !== top || performance.now() - lastRecord < 2000) return;
      lastRecord = performance.now();
      record('wheel', x, y, target, list);
    }, 200);
  }, { capture: true, passive: true });
}
