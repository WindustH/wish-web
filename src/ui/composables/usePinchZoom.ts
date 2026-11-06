import { ref, watch, type Ref } from 'vue';

type Point = { x: number; y: number };
/** Own two-finger zoom while leaving ordinary one-finger scrolling to the viewport. */
export function usePinchZoom(
  element: Ref<HTMLElement | undefined>,
  update: (ratio: number, from: Point, to: Point) => void,
  begin?: () => void,
) {
  const pinching = ref(false);
  watch(
    element,
    (host, _, cleanup) => {
      if (!host) return;
      let previous: { distance: number; center: Point; ids: string } | undefined;
      let quietUntil = 0;
      let suppressClick = false;
      function sample(touches: TouchList) {
        if (touches.length !== 2) return;
        const a = touches[0]!,
          b = touches[1]!;
        return {
          distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          center: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
          ids: [a.identifier, b.identifier].sort().join(','),
        };
      }
      function start(event: TouchEvent) {
        const next = sample(event.touches);
        if (!next) return;
        event.preventDefault();
        if (!pinching.value) begin?.();
        pinching.value = true;
        suppressClick = true;
        previous = next;
      }
      function move(event: TouchEvent) {
        if (!pinching.value) return;
        event.preventDefault();
        event.stopPropagation();
        const next = sample(event.touches);
        if (previous && next && previous.ids === next.ids && previous.distance > 0 && next.distance > 0)
          update(next.distance / previous.distance, previous.center, next.center);
        previous = next;
      }
      function end(event: TouchEvent) {
        previous = sample(event.touches);
        if (event.touches.length < 2) {
          if (suppressClick) quietUntil = performance.now() + 400;
          pinching.value = false;
          if (!event.touches.length) suppressClick = false;
        }
      }
      function click(event: MouseEvent) {
        if (performance.now() < quietUntil) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
      host.addEventListener('touchstart', start, { passive: false, capture: true });
      host.addEventListener('touchmove', move, { passive: false, capture: true });
      host.addEventListener('touchend', end, true);
      host.addEventListener('touchcancel', end, true);
      host.addEventListener('click', click, true);
      cleanup(() => {
        pinching.value = false;
        host.removeEventListener('touchstart', start, true);
        host.removeEventListener('touchmove', move, true);
        host.removeEventListener('touchend', end, true);
        host.removeEventListener('touchcancel', end, true);
        host.removeEventListener('click', click, true);
      });
    },
    { flush: 'post' },
  );
  return pinching;
}
