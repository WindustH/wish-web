import { ref, watch, type Ref } from 'vue';
import { noteTouchAction } from '../../ui/scrollStalls.ts';

const HOLD_MS = 450;
const MOVE_TOLERANCE = 10;
const EDGE_SIZE = 48;
const MAX_SCROLL_SPEED = 480; // Pixels per second.

/** Owns only touches that begin in this list while selection mode is active.
 * Before the hold completes, movement remains native scrolling. Afterwards the
 * gesture selects or deselects a range according to the anchor’s initial state,
 * including virtual rows. Reversing restores the baseline outside the range.
 */
export function useTouchRangeSelection(
  root: Ref<HTMLElement | null>,
  enabled: Ref<boolean>,
  ids: () => string[],
  chosen: Ref<Set<string>>,
) {
  const dragging = ref(false);
  watch(
    [root, enabled],
    ([element, active], _, onCleanup) => {
      if (!element || !active) return;
      let hold: ReturnType<typeof setTimeout> | undefined;
      let frame = 0;
      let suppressClickUntil = 0;
      let gesture:
        | {
            identifier: number;
            x: number;
            y: number;
            startX: number;
            startY: number;
            anchor: string;
            baseline: Set<string>;
            target?: string;
          }
        | undefined;
      const rowAtTarget = (target: EventTarget | null) =>
        target instanceof Element ? target.closest<HTMLElement>('[data-session-id]')?.dataset.sessionId : undefined;
      function stop() {
        clearTimeout(hold);
        cancelAnimationFrame(frame);
        gesture = undefined;
        dragging.value = false;
      }
      function extend(target: string) {
        if (!gesture || gesture.target === target) return;
        const order = ids();
        const start = order.indexOf(gesture.anchor),
          end = order.indexOf(target);
        if (start < 0 || end < 0) {
          stop();
          return;
        }
        gesture.target = target;
        const next = new Set(gesture.baseline);
        const deselect = gesture.baseline.has(gesture.anchor);
        for (const id of order.slice(Math.min(start, end), Math.max(start, end) + 1)) {
          if (deselect) next.delete(id);
          else next.add(id);
        }
        chosen.value = next;
        noteTouchAction(
          'session range selection',
          () => chosen.value.size === next.size && [...next].every((id) => chosen.value.has(id)),
        );
      }
      function targetAtFinger() {
        if (!gesture) return;
        const box = element!.getBoundingClientRect();
        const x = Math.max(box.left + 1, Math.min(box.right - 1, gesture.x));
        const y = Math.max(box.top + 1, Math.min(box.bottom - 1, gesture.y));
        const hit = document.elementFromPoint(x, y);
        if (!hit || !element!.contains(hit)) return;
        const direct = rowAtTarget(hit);
        if (direct) {
          extend(direct);
          return;
        }
        // Gaps and headings have no selection ID; use the nearest visible row.
        let nearest: { id: string; distance: number } | undefined;
        for (const row of element!.querySelectorAll<HTMLElement>('[data-session-id]')) {
          const rect = row.getBoundingClientRect();
          if (rect.bottom < box.top || rect.top > box.bottom) continue;
          const distance = Math.max(rect.top - y, y - rect.bottom, 0);
          if (!nearest || distance < nearest.distance) nearest = { id: row.dataset.sessionId!, distance };
        }
        if (nearest) extend(nearest.id);
      }
      let lastFrame = 0;
      function scroll(now: number) {
        if (!gesture || !dragging.value) return;
        const box = element!.getBoundingClientRect();
        const top = Math.max(0, Math.min(1, (box.top + EDGE_SIZE - gesture.y) / EDGE_SIZE));
        const bottom = Math.max(0, Math.min(1, (gesture.y - box.bottom + EDGE_SIZE) / EDGE_SIZE));
        element!.scrollTop += ((bottom - top) * MAX_SCROLL_SPEED * Math.min(now - lastFrame, 32)) / 1000;
        lastFrame = now;
        targetAtFinger();
        frame = requestAnimationFrame(scroll);
      }
      function start(event: TouchEvent) {
        // Selection mode owns gestures beginning in this region, including native
        // scrolls. An ancestor sheet must not start a dismissal for the same touch.
        event.stopPropagation();
        stop();
        suppressClickUntil = 0;
        if (event.touches.length !== 1) return;
        const anchor = rowAtTarget(event.target);
        if (!anchor || !ids().includes(anchor)) return;
        const touch = event.touches[0]!;
        gesture = {
          identifier: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
          startX: touch.clientX,
          startY: touch.clientY,
          anchor,
          baseline: new Set(chosen.value),
        };
        hold = setTimeout(() => {
          if (!gesture) return;
          dragging.value = true;
          extend(gesture.anchor);
          lastFrame = performance.now();
          frame = requestAnimationFrame(scroll);
        }, HOLD_MS);
      }
      function move(event: TouchEvent) {
        if (!gesture) return;
        if (event.touches.length !== 1) {
          stop();
          return;
        }
        const touch = Array.from(event.touches).find((touch) => touch.identifier === gesture!.identifier);
        if (!touch) {
          stop();
          return;
        }
        gesture.x = touch.clientX;
        gesture.y = touch.clientY;
        if (!dragging.value) {
          if (Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > MOVE_TOLERANCE) stop();
          return;
        }
        if (event.cancelable) event.preventDefault();
        targetAtFinger();
      }
      function end(event: TouchEvent) {
        if (dragging.value) {
          if (event.cancelable) event.preventDefault();
          suppressClickUntil = performance.now() + 800;
        }
        stop();
      }
      function click(event: MouseEvent) {
        if (performance.now() >= suppressClickUntil) return;
        event.preventDefault();
        event.stopPropagation();
      }
      function context(event: Event) {
        if (gesture) event.preventDefault();
      }
      element.addEventListener('touchstart', start, { passive: true });
      element.addEventListener('touchmove', move, { passive: false });
      element.addEventListener('touchend', end, { passive: false });
      element.addEventListener('touchcancel', end);
      element.addEventListener('click', click, true);
      element.addEventListener('contextmenu', context);
      onCleanup(() => {
        stop();
        element.removeEventListener('touchstart', start);
        element.removeEventListener('touchmove', move);
        element.removeEventListener('touchend', end);
        element.removeEventListener('touchcancel', end);
        element.removeEventListener('click', click, true);
        element.removeEventListener('contextmenu', context);
      });
    },
    { flush: 'post' },
  );
  return { dragging };
}
