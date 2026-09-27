import { onScopeDispose, watch, type Ref } from 'vue';
import { stepSpring } from './elasticPhysics.ts';

// Scrolling stays native, with one flourish at the ends: when the user's
// scrolling arrives at the top or bottom, the content overshoots and springs
// back, once. How far goes by the greater of the speed it arrived at and the
// force the user was putting in at that moment: a hard flick of the wheel a
// few pixels from the end moves the list only those pixels, but bounces as
// hard as it was meant. At an end the list already rests at, a deliberate
// shove bounces by its force too; nudges, and the fading momentum after a
// bounce, do not. Until a bounce has played out, pushing on toward the same
// end does nothing more; scrolling back the other way cuts it short. Only the
// user's own scrolling counts. Writes the app makes (following new output,
// keeping the place as history loads) arrive without a bounce.
const IDLE = 150;       // ms without input or scrolling that ends the user's scroll
const FORCE_SPAN = 120; // ms an input's force still counts toward an arrival
const MIN_SPEED = 250;  // px/s; gentler arrivals just stop
const MAX_KICK = 1160;  // px/s handed to the spring, about 60px of overshoot
const END = 1.5;        // px of tolerance for fractional scroll positions
const SHOVE = 300;      // px/s a push at a resting end needs: about 5px asked per event
const PUSH_GAP = 180;   // ms of quiet after which the next push is a new one

/**
 * Spring velocity for an arrival or shove at `speed` px/s, or 0 when too gentle
 * to bounce. The base keeps even a light one about a dozen pixels long.
 */
export function bounceVelocity(speed: number): number {
  return speed < MIN_SPEED ? 0 : Math.min(MAX_KICK, 160 + speed * 0.3);
}

export function useEdgeBounce(
  scrollEl: Ref<HTMLElement | null>,
  contentEl: Ref<HTMLElement | null>,
  pageActive: Ref<boolean>,
  resetKey: Ref<unknown>,
) {
  let userAt = -Infinity;
  let lastTop = 0;
  let lastMax = 0;
  let lastTime = 0;
  let speed = 0;            // px/ms, positive downward
  let previousSpeed = 0;
  let force = 0;            // px/s the input asked for, positive downward
  let forceAt = -Infinity;
  let touchY: number | undefined;
  let touchTime = 0;
  let shovedThisTouch = false;
  let pushAt = -Infinity;
  let pushForce = 0;
  let edge: -1 | 0 | 1 = 0; // the end bouncing: +1 top, -1 bottom
  let position = 0;
  let velocity = 0;
  let frame = 0;
  let frameTime = 0;
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  function paint(target = contentEl.value) {
    if (target) target.style.translate = position ? `0 ${position}px` : '';
  }

  function stop(target = contentEl.value) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    frameTime = 0;
    edge = 0;
    position = 0;
    velocity = 0;
    paint(target);
  }

  function springFrame(now: number) {
    frame = 0;
    if (!pageActive.value || !contentEl.value) { stop(); return; }
    const elapsed = frameTime ? now - frameTime : 16;
    frameTime = now;
    ({ position, velocity } = stepSpring(position, velocity, elapsed));
    paint();
    if (position || velocity) frame = requestAnimationFrame(springFrame);
    else stop();
  }

  function bounce(direction: 1 | -1, pxPerSecond: number) {
    const kick = bounceVelocity(pxPerSecond);
    if (!kick) return;
    stop();
    edge = direction;
    velocity = direction * kick;
    frame = requestAnimationFrame(springFrame);
  }

  // Scrolling back the other way ends the bounce at once.
  function away(downward: boolean) {
    if (edge === 1 ? downward : edge === -1 ? !downward : false) stop();
  }

  function feel(time: number, pxPerSecond: number) {
    userAt = time;
    force = pxPerSecond;
    forceAt = time;
  }

  // The end a push runs into, if the list already rests there: +1 top, -1 bottom.
  function endAhead(downward: boolean): -1 | 0 | 1 {
    const el = scrollEl.value;
    if (!el || reduced?.matches || !pageActive.value) return 0;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return 0;
    if (!downward && el.scrollTop <= END) return 1;
    if (downward && el.scrollTop >= max - END) return -1;
    return 0;
  }

  function shove(pxPerSecond: number) {
    const end = endAhead(pxPerSecond > 0);
    if (end && !edge && Math.abs(pxPerSecond) >= SHOVE) bounce(end, Math.abs(pxPerSecond));
  }

  function onInput(event: Event) { userAt = event.timeStamp; }
  function onWheel(event: WheelEvent) {
    userAt = event.timeStamp;
    if (!event.deltaY) return;
    away(event.deltaY > 0);
    // What this event asked for, as a speed: events come about every 16 ms.
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
    const pxPerSecond = pixels * 60;
    feel(event.timeStamp, pxPerSecond);
    // A new push: after a pause, or clearly harder than the one before (a fresh
    // swipe during momentum). A stream that only holds or fades is the same one.
    const fresh = event.timeStamp - pushAt > PUSH_GAP || Math.abs(pxPerSecond) > pushForce * 1.3;
    pushAt = event.timeStamp;
    pushForce = Math.abs(pxPerSecond);
    if (fresh) shove(pxPerSecond);
  }
  function onTouchStart(event: TouchEvent) {
    userAt = event.timeStamp;
    touchY = event.touches[0]?.clientY;
    touchTime = event.timeStamp;
    shovedThisTouch = false;
  }
  function onTouchMove(event: TouchEvent) {
    userAt = event.timeStamp;
    const y = event.touches[0]?.clientY;
    if (y != null && touchY != null && y !== touchY) {
      away(y < touchY);
      // A finger moving up scrolls down.
      const pxPerSecond = (touchY - y) / Math.max(event.timeStamp - touchTime, 8) * 1000;
      feel(event.timeStamp, pxPerSecond);
      // At most one shove per finger gesture.
      if (!shovedThisTouch && !edge && endAhead(pxPerSecond > 0) && Math.abs(pxPerSecond) >= SHOVE) {
        shovedThisTouch = true;
        shove(pxPerSecond);
      }
    }
    touchY = y;
    touchTime = event.timeStamp;
  }

  function onScroll(event: Event) {
    const el = scrollEl.value;
    if (!el) return;
    const now = event.timeStamp;
    const top = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;
    const user = now - userAt < IDLE;
    if (user) {
      // A scroll that keeps moving (momentum, a smooth notch) is still the user's.
      userAt = now;
      previousSpeed = speed;
      speed = (top - lastTop) / Math.min(Math.max(now - lastTime, 8), 32);
    }
    const atTop = top <= END;
    const atBottom = max > 0 && top >= max - END;
    if ((edge === 1 && !atTop) || (edge === -1 && !atBottom)) stop();
    if (user && !edge && pageActive.value && !reduced?.matches && max > 0) {
      // The step that meets the end is cut short by it; the one before tells the speed better.
      const moving = (Math.sign(speed) === Math.sign(previousSpeed) && Math.abs(previousSpeed) > Math.abs(speed) ? previousSpeed : speed) * 1000;
      const pushing = now - forceAt <= FORCE_SPAN ? force : 0;
      if (atTop && lastTop > END && moving < 0) bounce(1, Math.max(-moving, -pushing));
      else if (atBottom && lastTop < lastMax - END && moving > 0) bounce(-1, Math.max(moving, pushing));
    }
    lastTop = top;
    lastMax = max;
    lastTime = now;
  }

  watch(scrollEl, (el, _, cleanup) => {
    stop();
    if (!el) return;
    lastTop = el.scrollTop;
    lastMax = el.scrollHeight - el.clientHeight;
    const passive = { passive: true };
    el.addEventListener('scroll', onScroll, passive);
    el.addEventListener('wheel', onWheel, passive);
    el.addEventListener('touchstart', onTouchStart, passive);
    el.addEventListener('touchmove', onTouchMove, passive);
    el.addEventListener('touchend', onInput, passive);
    el.addEventListener('keydown', onInput);
    el.addEventListener('pointerdown', onInput, passive);
    cleanup(() => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onInput);
      el.removeEventListener('keydown', onInput);
      el.removeEventListener('pointerdown', onInput);
      stop();
    });
  }, { immediate: true });
  watch(contentEl, (_, previous) => stop(previous ?? undefined));
  watch(pageActive, active => { if (!active) stop(); });
  watch(resetKey, () => stop());
  onScopeDispose(() => stop());
}
