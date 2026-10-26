// Gestures that should have done something and did not, kept for the debug page: a swipe that
// scrolled nothing under it, and a tap that made no click. A page that now and then stops answering
// is easier to read from what was on it at that moment than to guess at: what the finger landed on,
// what lay over it, and whether the page's own listeners cancelled or stopped the events.
import { ref } from 'vue';

export interface ScrollStall {
  at: string;
  /** The frontend bundle running when this record was captured; absent on older records. */
  build?: string;
  kind: 'touch' | 'wheel' | 'tap';
  route: string;
  /** What the gesture landed on, and the list under it that could have scrolled. */
  target: string;
  scroller: string;
  /** The topmost element at the point, when it is not part of the list: what covered it. */
  coveredBy?: string;
  touchAction?: string;
  inertAncestor?: string;
  gestureAction?: string;
  movement?: { x: number; y: number };
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
    const count = [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length && getComputedStyle(element).visibility === 'visible').length;
    if (count) found.push(`${name} ×${count}`);
  }
  return found;
}
function record(kind: ScrollStall['kind'], x: number, y: number, target: Element | null, list: HTMLElement | null, extra: Partial<ScrollStall> = {}) {
  const top = document.elementFromPoint(x, y);
  keep({
    at: new Date().toISOString(),
    build: typeof __WEB_BUILD_ID__ === 'string' ? __WEB_BUILD_ID__ : 'development',
    kind,
    route: location.hash || location.pathname,
    target: describe(target),
    scroller: list ? describe(list) : '',
    coveredBy: top && !(list ?? target)?.contains(top) ? describe(top) : undefined,
    touchAction: target instanceof Element ? getComputedStyle(target).touchAction : undefined,
    inertAncestor: target?.closest('[inert]') ? describe(target.closest('[inert]')) : undefined,
    ...extra,
    scroll: list ? `${Math.round(list.scrollTop)} / ${list.scrollHeight} / ${list.clientHeight}` : '',
    page: `body{${document.body.getAttribute('style') ?? ''}} html.${[...document.documentElement.classList].join('.')}`,
    layers: layers(),
  });
}

let scrolledAt = 0;
type TouchAction = { name: string; completed: () => boolean };
type Touch = { action?: TouchAction; dx: number; x: number; y: number; dy: number; far: number; at: number; moves: number; seen: number; cancelled: number; target: Element | null; menu: boolean };
let touch: Touch | undefined;
let wheelPending = false;
let lastRecord = 0;
// A menu in sight takes the next press only to close; that press scrolling nothing is no stall.
const menuInSight = () => [...document.querySelectorAll('.menu-pop, [role="dialog"]:not(.pwa-update)')].some(element => {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth && getComputedStyle(element).visibility === 'visible';
});

// A tap on something that answers taps should make a click: one seen first of all, by the window as
// it comes down, and again last of all, as it goes back up. Seen only coming down, a listener on the
// way stopped it; not seen at all, nothing took the tap as one.
type ObservedClick = { at: number; target: EventTarget | null };
let clickDown: ObservedClick | undefined, clickUp: ObservedClick | undefined;
function matchesTap(click: ObservedClick | undefined, gesture: Touch, target: Element | null) {
  return !!click && click.at >= gesture.at && click.target instanceof Node && !!target?.contains(click.target);
}
let swallowed: { by: string; at: number } | undefined;
/** Called by the page's own listeners that keep a click from what it landed on, saying why. */
export function noteSwallowedClick(by: string) { swallowed = { by, at: performance.now() }; }
/** A gesture may navigate instead of scroll. Suppress its stall only after that action succeeds. */
export function noteTouchAction(name: string, completed: () => boolean) {
  if (touch) touch.action = { name, completed };
}
const ANSWERS = 'a, button, [role="button"], [role="option"], [role="menuitem"], input, label, summary, .sl-item';
function watchTap(gesture: Touch) {
  const target = gesture.target instanceof Element ? gesture.target.closest(ANSWERS) : null;
  // A stranded clear menu backdrop catches taps before they can reach any button.
  // Those taps have no clickable target, so the ordinary missing-click check misses them.
  const strayBackdrop = gesture.target instanceof Element && !!gesture.target.closest('.menu-backdrop') && !menuInSight();
  // A stale page lock makes hit-testing land on html/body instead of the button under it.
  // Keep that failed tap too; otherwise closing a dialog can strand the page without any record.
  const blockedPage = getComputedStyle(document.body).pointerEvents === 'none' && !menuInSight();
  if (!target && !strayBackdrop && !blockedPage) return;
  // A touchend handler can activate synchronously before this window listener runs.
  // Match clicks from the whole gesture, and only on the button that was touched.
  setTimeout(() => {
    if (gesture.action?.completed()) return;
    if ((!strayBackdrop && matchesTap(clickUp, gesture, target)) || performance.now() - lastRecord < 2000) return;
    lastRecord = performance.now();
    record('tap', gesture.x, gesture.y, gesture.target, null, {
      click: blockedPage ? 'page pointer lock without a visible dialog' : strayBackdrop ? 'stray menu backdrop caught the tap' : matchesTap(clickDown, gesture, target) ? 'stopped on the way' : 'none came',
      swallowedBy: swallowed && swallowed.at >= gesture.at ? swallowed.by : undefined,
    });
  }, gesture.action ? 600 : 350);
}

/** Starts keeping stalls; every listener is passive and only reads. */
export function installScrollStallLog() {
  window.addEventListener('click', event => { clickDown = { at: performance.now(), target: event.target }; }, { capture: true, passive: true });
  window.addEventListener('click', event => { clickUp = { at: performance.now(), target: event.target }; }, { passive: true });
  document.addEventListener('scroll', () => { scrolledAt = performance.now(); }, { capture: true, passive: true });
  window.addEventListener('touchstart', event => {
    const point = event.touches[0];
    touch = event.touches.length === 1 && point
      ? { x: point.clientX, y: point.clientY, dx: 0, dy: 0, far: 0, at: performance.now(), moves: 0, seen: 0, cancelled: 0, target: event.target as Element, menu: menuInSight() }
      : undefined;
  }, { capture: true, passive: true });
  // Capture every move before page listeners; observe cancellation after dispatch.
  window.addEventListener('touchmove', event => {
    const point = event.touches[0];
    if (!touch || !point) return;
    touch.moves++;
    // A stopped event never reaches the window's bubble listener. Count cancellation after
    // dispatch so preventDefault and stopPropagation are measured independently.
    const gesture = touch;
    setTimeout(() => { if (event.defaultPrevented) gesture.cancelled++; }, 0);
    touch.dx = point.clientX - touch.x;
    touch.dy = point.clientY - touch.y;
    touch.far = Math.max(touch.far, Math.hypot(point.clientX - touch.x, touch.dy));
  }, { capture: true, passive: true });
  window.addEventListener('touchmove', () => {
    if (!touch) return;
    touch.seen++;
  }, { passive: true });
  window.addEventListener('touchend', () => {
    const gesture = touch;
    touch = undefined;
    // A tap may tremble a few pixels; it is still a tap that should make a click.
    if (gesture && !gesture.menu && gesture.far < 10 && performance.now() - gesture.at < 500) watchTap(gesture);
    if (!gesture || gesture.menu || Math.abs(gesture.dy) < 48) return;
    // A scroll that did happen has fired by the next frames.
    setTimeout(() => {
      if (gesture.action?.completed()) return;
      if (scrolledAt > gesture.at || performance.now() - lastRecord < 2000) return;
      const list = scrollerAt(gesture.x, gesture.y);
      if (!list || !canScroll(list, -gesture.dy)) return;
      lastRecord = performance.now();
      record('touch', gesture.x, gesture.y, gesture.target, list, {
        moves: `${gesture.cancelled} cancelled, ${gesture.moves - gesture.seen} stopped, of ${gesture.moves}`,
        gestureAction: gesture.action?.name,
        movement: { x: Math.round(gesture.dx), y: Math.round(gesture.dy) },
      });
    }, gesture.action ? 600 : 150);
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
