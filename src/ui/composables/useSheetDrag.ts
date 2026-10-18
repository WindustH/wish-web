import { onBeforeUnmount, watch } from 'vue';
import { animate, motionValue } from 'motion-v';

const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.28 } as const;
// A pull down this fast (px/s) lets go whatever the distance.
const FLICK = 600;

/**
 * A sheet a finger pulls down to put away: from its head, or from its body once that is scrolled to
 * the top. Let go past a third of its height, or with a flick, and it goes on down and closes;
 * short of that it springs back. The pull moves `translate`, so the sheet's own entrance and exit
 * keep `transform`; the exit picks up from where the finger left it, through `--sheet-drag`.
 */
export function useSheetDrag(element: () => HTMLElement | null | undefined, enabled: () => boolean, close: () => void) {
  const offset = motionValue(0);
  offset.on('change', value => {
    const el = element();
    if (el) el.style.translate = value > 0 ? `0 ${value}px` : '';
  });
  let start: number | undefined;
  let pulling = false;
  function onStart(event: TouchEvent) {
    const touch = event.touches[0];
    start = undefined;
    if (!enabled() || event.touches.length !== 1 || !touch) return;
    const body = event.target instanceof Element ? event.target.closest('.modal-body') : null;
    if (body && body.scrollTop > 0) return;
    offset.stop();
    start = touch.clientY - offset.get();
    pulling = false;
  }
  function onMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (start === undefined || !touch) return;
    const moved = touch.clientY - start;
    if (!pulling) {
      // Pushed up, the body scrolls; the pull starts only downwards.
      if (moved < -4) { start = undefined; return; }
      if (moved < 4) return;
      pulling = true;
    }
    event.preventDefault();
    offset.set(Math.max(0, moved));
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
  watch(element, (el, _, cleanup) => {
    if (!el) return;
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    cleanup(() => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    });
  }, { flush: 'post' });
  onBeforeUnmount(() => offset.destroy());
}
