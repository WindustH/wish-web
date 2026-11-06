import { watch, type Ref } from 'vue';

export function useMiddlePan(element: Ref<HTMLElement | undefined>) {
  watch(
    element,
    (host, _, cleanup) => {
      if (!host) return;
      let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
      function down(event: PointerEvent) {
        if (event.pointerType !== 'mouse' || event.button !== 1) return;
        event.preventDefault();
        drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: host!.scrollLeft,
          top: host!.scrollTop,
        };
        host!.setPointerCapture(event.pointerId);
        host!.classList.add('middle-panning');
      }
      function move(event: PointerEvent) {
        if (!drag || event.pointerId !== drag.id) return;
        event.preventDefault();
        host!.scrollLeft = drag.left + drag.x - event.clientX;
        host!.scrollTop = drag.top + drag.y - event.clientY;
      }
      function stop() {
        const previous = drag;
        drag = undefined;
        host!.classList.remove('middle-panning');
        if (previous && host!.hasPointerCapture(previous.id)) host!.releasePointerCapture(previous.id);
      }
      host.addEventListener('pointerdown', down);
      host.addEventListener('pointermove', move);
      host.addEventListener('pointerup', stop);
      host.addEventListener('pointercancel', stop);
      host.addEventListener('lostpointercapture', stop);
      window.addEventListener('blur', stop);
      cleanup(() => {
        stop();
        host.removeEventListener('pointerdown', down);
        host.removeEventListener('pointermove', move);
        host.removeEventListener('pointerup', stop);
        host.removeEventListener('pointercancel', stop);
        host.removeEventListener('lostpointercapture', stop);
        window.removeEventListener('blur', stop);
      });
    },
    { flush: 'post' },
  );
}
