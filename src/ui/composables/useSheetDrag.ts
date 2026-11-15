import { onBeforeUnmount, watch } from 'vue';
import { animate, motionValue } from 'motion-v';

const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.28 } as const;
// A pull down this fast (px/s) lets go whatever the distance.
const FLICK = 600;

/**
 * A sheet a finger pulls down to put away: from its head, or from its body once whatever the finger
 * is on is scrolled to the top. Let go past a third of its height, or with a flick, and it goes on
 * down and closes; short of that it springs back. The pull moves `translate`, so the sheet's own entrance and exit
 * keep `transform`; the exit picks up from where the finger left it, through `--sheet-drag`.
 */
export function useSheetDrag(element: () => HTMLElement | null | undefined, enabled: () => boolean, close: () => void) {
  const offset = motionValue(0);
  offset.on('change', (value) => {
    const el = element();
    if (el) el.style.translate = value > 0 ? `0 ${value}px` : '';
  });
  let start: { x: number; y: number; offset: number } | undefined;
  let pulling = false;
  function onStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (pulling) cancelPull();
    start = undefined;
    if (!enabled() || event.defaultPrevented || event.touches.length !== 1 || !touch) return;
    // On something scrolled down - the body, or a long block within it - a pull down scrolls it back.
    for (
      let node = event.target instanceof Element ? event.target : null;
      node && node !== event.currentTarget;
      node = node.parentElement
    ) {
      if (
        node.scrollTop > 0 ||
        node.matches('[data-sheet-drag-ignore], [draggable="true"], input, textarea, select, [contenteditable="true"]')
      )
        return;
      const style = getComputedStyle(node);
      // Image panning, timeline handles and horizontally scrollable code own their gesture.
      if (style.touchAction === 'none' || (node.scrollWidth > node.clientWidth && /auto|scroll/.test(style.overflowX)))
        return;
    }
    offset.stop();
    start = { x: touch.clientX, y: touch.clientY, offset: offset.get() };
    pulling = false;
  }
  function onMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (start === undefined || !touch) return;
    if (!enabled() || event.touches.length !== 1 || event.defaultPrevented || !event.cancelable) {
      cancelPull();
      return;
    }
    const dx = Math.abs(touch.clientX - start.x);
    const dy = touch.clientY - start.y;
    if (!pulling) {
      // Pushed up, the body scrolls; the pull starts only downwards.
      if (dy < -4 || (dx >= 10 && dx >= Math.abs(dy))) {
        start = undefined;
        return;
      }
      if (dy < 10 || dy < dx * 1.25) return;
      pulling = true;
    }
    event.preventDefault();
    offset.set(Math.max(0, dy + start.offset));
  }
  function onEnd() {
    if (start === undefined) return;
    start = undefined;
    if (!pulling) return;
    pulling = false;
    const el = element();
    const pulled = offset.get();
    if (el && (pulled > el.offsetHeight / 3 || offset.getVelocity() > FLICK)) {
      el.style.setProperty('--sheet-drag', `${pulled}px`);
      offset.jump(0);
      close();
    } else {
      animate(offset, 0, SPRING);
    }
  }
  function cancelPull() {
    start = undefined;
    pulling = false;
    animate(offset, 0, SPRING);
  }
  watch(
    element,
    (el, _, cleanup) => {
      if (!el) return;
      offset.jump(0);
      start = undefined;
      pulling = false;
      el.style.translate = '';
      el.style.removeProperty('--sheet-drag');
      el.addEventListener('touchstart', onStart, { passive: true });
      el.addEventListener('touchmove', onMove, { passive: false });
      el.addEventListener('touchend', onEnd);
      el.addEventListener('touchcancel', cancelPull);
      cleanup(() => {
        offset.stop();
        start = undefined;
        pulling = false;
        el.removeEventListener('touchstart', onStart);
        el.removeEventListener('touchmove', onMove);
        el.removeEventListener('touchend', onEnd);
        el.removeEventListener('touchcancel', cancelPull);
      });
    },
    { flush: 'post' },
  );
  onBeforeUnmount(() => offset.destroy());
}
