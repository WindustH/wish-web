import { ref, watch, type Ref } from 'vue';

const backdrops = '.modal-overlay,.overlay-window-scrim,.settings-overlay,.menu-backdrop,.island-scrim';
const overlays =
  backdrops +
  ',.control-tooltip,.toast-clear,[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="tooltip"],.toast';

// Native child views sit above the HTML compositor. Hide the guest while a
// visible popup covers its rectangle, including portals outside the sidebar.
export function useSurfaceOcclusion(surface: Readonly<Ref<HTMLElement | null>>) {
  const covered = ref(false);
  watch(
    surface,
    (element, _, cleanup) => {
      covered.value = false;
      if (!element) return;
      function check() {
        const bounds = element!.getBoundingClientRect();
        covered.value = Array.from(document.querySelectorAll<HTMLElement>(overlays)).some((overlay) => {
          if (overlay.contains(element) || overlay.dataset.state === 'closed' || !overlay.getClientRects().length)
            return false;
          const r = overlay.getBoundingClientRect();
          const left = Math.max(bounds.left, r.left),
            right = Math.min(bounds.right, r.right);
          const top = Math.max(bounds.top, r.top),
            bottom = Math.min(bounds.bottom, r.bottom);
          if (right <= left || bottom <= top) return false;
          if (getComputedStyle(overlay).visibility === 'hidden') return false;
          const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
          // The sidebar's own scrim is behind the surface. Tooltips deliberately ignore hit testing.
          return (
            overlay.contains(hit) || (!overlay.matches(backdrops) && getComputedStyle(overlay).pointerEvents === 'none')
          );
        });
      }
      let frame = 0;
      function schedule() {
        if (!frame)
          frame = requestAnimationFrame(() => {
            frame = 0;
            check();
          });
      }
      const observer = new MutationObserver((records) => {
        if (
          records.some((record) =>
            record.type === 'attributes'
              ? record.target instanceof Element &&
                (record.target.matches(overlays + ',[data-reka-popper-content-wrapper]') ||
                  !!record.target.closest('[data-reka-popper-content-wrapper]'))
              : [...record.addedNodes, ...record.removedNodes].some(
                  (n) => n instanceof Element && (n.matches(overlays) || n.querySelector(overlays)),
                ),
          )
        )
          schedule();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'data-state', 'hidden', 'aria-hidden', 'role'],
      });
      const resize = new ResizeObserver(schedule);
      window.addEventListener('resize', schedule);
      resize.observe(element);
      check();
      cleanup(() => {
        window.removeEventListener('resize', schedule);
        cancelAnimationFrame(frame);
        observer.disconnect();
        resize.disconnect();
      });
    },
    { flush: 'post' },
  );
  return covered;
}
