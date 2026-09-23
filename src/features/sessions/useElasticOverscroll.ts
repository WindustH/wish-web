import { onScopeDispose, watch, type Ref } from 'vue';
import { MAX_STRETCH, stepSpring, stretchFromDrag, wheelPixels } from './elasticPhysics.js';

// Stretch message content at the scroll limits while keeping the viewport,
// scrollbar and surrounding page fixed. Wheel impulses and the restoring
// spring run at the same time, including during trackpad momentum.
export function useElasticOverscroll(
  scrollEl: Ref<HTMLElement | null>,
  contentEl: Ref<HTMLElement | null>,
  pageActive: Ref<boolean>,
  sessionId: Ref<string>,
) {
  let startX = 0;
  let startY = 0;
  let lastY: number | undefined;
  let edge: -1 | 0 | 1 = 0; // +1 top, -1 bottom
  let dragDistance = 0;
  let position = 0;
  let velocity = 0;
  let frame = 0;
  let frameTime = 0;
  let lastTouchMove = 0;

  function nestedScroller(target: EventTarget | null, root: HTMLElement) {
    for (let node = target instanceof Element ? target : null; node && node !== root; node = node.parentElement) {
      if (!(node instanceof HTMLElement) || node.scrollHeight <= node.clientHeight + 1) continue;
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
    return false;
  }

  function paint() {
    const el = contentEl.value;
    if (el) el.style.translate = position ? `0 ${position}px` : '';
  }

  function stopFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    frameTime = 0;
  }

  function reset(target = contentEl.value) {
    stopFrame();
    edge = 0;
    dragDistance = 0;
    position = 0;
    velocity = 0;
    lastY = undefined;
    lastTouchMove = 0;
    if (target) target.style.translate = '';
  }

  function springFrame(now: number) {
    frame = 0;
    if (!pageActive.value || !contentEl.value) { reset(); return; }
    const elapsed = frameTime ? now - frameTime : 16;
    frameTime = now;
    ({ position, velocity } = stepSpring(position, velocity, elapsed));
    paint();
    if (position || velocity) frame = requestAnimationFrame(springFrame);
    else frameTime = 0;
  }

  function startSpring() {
    if (!frame && (position || velocity)) {
      frameTime = 0;
      frame = requestAnimationFrame(springFrame);
    }
  }

  function touchStart(event: TouchEvent) {
    reset();
    if (!pageActive.value || event.touches.length !== 1) return;
    const touch = event.touches[0]!;
    startX = touch.clientX;
    startY = lastY = touch.clientY;
  }

  function touchMove(event: TouchEvent) {
    const el = scrollEl.value;
    const touch = event.touches[0];
    if (!pageActive.value || !el || event.touches.length !== 1 || !touch || lastY == null || !event.cancelable) return;
    const delta = touch.clientY - lastY;
    lastY = touch.clientY;
    if (!delta || nestedScroller(event.target, el)) return;
    if (!edge && Math.abs(touch.clientX - startX) > Math.abs(touch.clientY - startY)) return;
    if (!edge) {
      if (delta > 0 && el.scrollTop <= 1) edge = 1;
      else if (delta < 0 && el.scrollTop >= el.scrollHeight - el.clientHeight - 1) edge = -1;
      else return;
    }
    const next = dragDistance + delta;
    event.preventDefault();
    if (edge * next <= 0) {
      reset();
      lastY = touch.clientY;
      return;
    }
    const nextPosition = stretchFromDrag(next);
    const elapsed = event.timeStamp - lastTouchMove;
    velocity = lastTouchMove && elapsed > 0 && elapsed < 80
      ? Math.max(-320, Math.min(320, (nextPosition - position) * 1000 / elapsed))
      : 0;
    dragDistance = next;
    position = nextPosition;
    lastTouchMove = event.timeStamp;
    paint();
  }

  function release() {
    lastY = undefined;
    edge = 0;
    dragDistance = 0;
    if (lastTouchMove && performance.now() - lastTouchMove > 80) velocity = 0;
    lastTouchMove = 0;
    startSpring();
  }

  function wheel(event: WheelEvent) {
    const el = scrollEl.value;
    if (!pageActive.value || !el || !contentEl.value || lastY != null || !event.deltaY || event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || nestedScroller(event.target, el)) return;
    const delta = wheelPixels(event.deltaY, event.deltaMode, el.clientHeight);
    const outward = delta < 0 ? el.scrollTop <= 1 : el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
    if (!outward) return;
    const direction = delta < 0 ? 1 : -1;
    // Every outward event produces visible feedback, even if a previous
    // gesture's spring is already returning toward the boundary.
    if (position * direction < 0) { position = 0; velocity = 0; }
    const force = Math.min(Math.abs(delta), 28);
    position = direction * Math.min(MAX_STRETCH, Math.abs(position) + force * 0.13);
    velocity = Math.max(-500, Math.min(500, velocity + direction * force * 5));
    paint();
    startSpring();
  }

  watch(contentEl, (_, previous) => reset(previous));
  watch(scrollEl, () => reset());
  watch(pageActive, active => { if (!active) reset(); });
  watch(sessionId, () => reset());
  onScopeDispose(() => reset());

  return { touchStart, touchMove, release, wheel };
}
