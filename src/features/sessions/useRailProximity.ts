// Only the rail's opacity changes, at most once per frame. Pointer tracking never
// updates Vue state or invalidates the message list's styles and measurements.
import { watch, type Ref } from 'vue';
import { useMedia } from '../../ui/composables/useMedia.ts';
import { RAIL_DRAWER_WIDTH } from './useRailSwipe.ts';

export function useRailProximity(
  rail: Ref<HTMLElement | undefined>,
  enabled?: Readonly<Ref<boolean>>,
  followPointer = false,
) {
  const desktopMouse = useMedia('(min-width: 900px)');
  watch(
    [rail, desktopMouse, () => enabled?.value ?? true],
    ([element, desktop, enabled], _, cleanup) => {
      if (!element || !desktop || !enabled) return;
      const frame = element.closest<HTMLElement>('.chatlog-wrap');
      if (!frame) return;
      let pending = 0;
      let pointerX: number | null = null;
      let pointerY: number | null = null;
      const paint = () => {
        pending = 0;
        if (followPointer) {
          const box = frame.getBoundingClientRect();
          const content = frame.querySelector<HTMLElement>('.chatlog-content');
          const line = content?.querySelector<HTMLElement>('.rail-clip');
          if (content && line) {
            const transform = new DOMMatrixReadOnly(getComputedStyle(content).transform);
            // Use the rail's open position, independent of the drawer's current translation.
            element.style.left = `${line.getBoundingClientRect().left - box.left - transform.m41 + RAIL_DRAWER_WIDTH}px`;
          }
          if (pointerY !== null && !element.matches(':focus-visible'))
            element.style.top = `${Math.max(0, Math.min(box.height - element.offsetHeight, pointerY - box.top - element.offsetHeight / 2))}px`;
        }
        const distance = pointerX == null ? Infinity : Math.abs(pointerX - (element.getBoundingClientRect().left + 12));
        const t = Math.max(0, Math.min(1, (distance - 32) / 188));
        // When expanded, let the actual activity nodes receive the pointer instead of covering them.
        const overNode =
          followPointer &&
          pointerX !== null &&
          pointerY !== null &&
          frame.classList.contains('rail-out') &&
          document.elementsFromPoint(pointerX, pointerY).some((node) => node.closest('.history-rail-node'));
        const opacity = overNode ? 0 : 1 - t * t * (3 - 2 * t);
        element.style.setProperty('--rail-proximity', String(opacity));
        if (followPointer) element.style.pointerEvents = opacity > 0.05 ? '' : 'none';
      };
      const schedule = () => {
        if (!pending) pending = requestAnimationFrame(paint);
      };
      const move = (event: PointerEvent) => {
        if (event.pointerType === 'touch') {
          element.classList.remove('rail-proximity');
          return;
        }
        element.classList.add('rail-proximity');
        pointerX = event.clientX;
        pointerY = event.clientY;
        schedule();
      };
      const leave = () => {
        pointerX = null;
        schedule();
      };
      frame.addEventListener('pointermove', move, { passive: true });
      frame.addEventListener('pointerleave', leave);
      window.addEventListener('blur', leave);
      const resize = new ResizeObserver(schedule);
      resize.observe(frame);
      element.classList.toggle('rail-proximity', matchMedia('(hover: hover) and (pointer: fine)').matches);
      paint();
      cleanup(() => {
        cancelAnimationFrame(pending);
        resize.disconnect();
        frame.removeEventListener('pointermove', move);
        frame.removeEventListener('pointerleave', leave);
        window.removeEventListener('blur', leave);
        element.style.removeProperty('--rail-proximity');
        if (followPointer) {
          element.style.removeProperty('top');
          element.style.removeProperty('left');
          element.style.removeProperty('pointer-events');
        }
        element.classList.remove('rail-proximity');
      });
    },
    { flush: 'post', immediate: true },
  );
}
