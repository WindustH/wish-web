import { watch, type Ref } from 'vue';

/** Panning owns the middle button, including its separate native mouse defaults. */
export function useMiddleButtonGuard(element: Ref<HTMLElement | null | undefined>) {
  watch(
    element,
    (host, _, cleanup) => {
      if (!host) return;
      const prevent = (event: MouseEvent) => {
        if (event.button === 1) event.preventDefault();
      };
      // Chromium can paste the Linux primary selection on pointerup before auxclick.
      // Cancel both release defaults; mousedown also prevents native autoscroll.
      host.addEventListener('mousedown', prevent);
      host.addEventListener('mouseup', prevent);
      host.addEventListener('auxclick', prevent);
      host.addEventListener('pointerup', prevent);
      cleanup(() => {
        host.removeEventListener('mousedown', prevent);
        host.removeEventListener('mouseup', prevent);
        host.removeEventListener('auxclick', prevent);
        host.removeEventListener('pointerup', prevent);
      });
    },
    { flush: 'post' },
  );
}
