// Only the rail's opacity changes, at most once per frame. Pointer tracking never
// updates Vue state or invalidates the message list's styles and measurements.
import { watch, type Ref } from 'vue';
import { useMedia } from '../../ui/composables/useMedia.ts';

export function useRailProximity(rail: Ref<HTMLElement | undefined>) {
  const desktopMouse = useMedia('(min-width: 900px)');
  watch(
    [rail, desktopMouse],
    ([element, enabled], _, cleanup) => {
      if (!element || !enabled) return;
      const frame = element.closest<HTMLElement>('.chatlog-wrap');
      if (!frame) return;
      let pending = 0;
      let pointerX: number | null = null;
      const paint = () => {
        pending = 0;
        const distance = pointerX == null ? Infinity : Math.abs(pointerX - (element.getBoundingClientRect().left + 12));
        const t = Math.max(0, Math.min(1, (distance - 32) / 188));
        element.style.setProperty('--rail-proximity', String(1 - t * t * (3 - 2 * t)));
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
        element.classList.remove('rail-proximity');
      });
    },
    { flush: 'post', immediate: true },
  );
}
