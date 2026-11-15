import { shallowRef, watch, type Ref } from 'vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';

type FocusRequest = { scope: 'list' | 'chat'; session?: string };
export const searchFocus = shallowRef<FocusRequest & { expires: number }>();
/** Route mounting may take several flushes, but an abandoned command must not steal focus later. */
export function requestSearchFocus(target: FocusRequest) {
  const request = { ...target, expires: Date.now() + 1500 };
  searchFocus.value = request;
  const cancel = () => {
    if (searchFocus.value === request) searchFocus.value = undefined;
  };
  const timer = setTimeout(cancel, 1500);
  queueMicrotask(() => {
    if (searchFocus.value !== request) return;
    document.addEventListener('pointerdown', cancel, true);
    document.addEventListener('keydown', cancel, true);
  });
  const stop = watch(
    searchFocus,
    (value) => {
      if (value === request) return;
      clearTimeout(timer);
      document.removeEventListener('pointerdown', cancel, true);
      document.removeEventListener('keydown', cancel, true);
      stop();
    },
    { flush: 'sync' },
  );
  return cancel;
}
/** The owning input consumes a request once it is mounted and its panel is active. */
export function useSearchFocus(
  input: Ref<HTMLInputElement | null>,
  scope: 'list' | 'chat',
  owner?: () => string | null,
) {
  const active = usePageActivity();
  watch(
    [input, active, searchFocus],
    ([element, shown, request], _, cleanup) => {
      if (!element || !shown || request?.scope !== scope || (owner && request.session !== owner())) return;
      const focus = () => {
        if (Date.now() >= request.expires) {
          if (searchFocus.value === request) searchFocus.value = undefined;
          return;
        }
        if (
          searchFocus.value !== request ||
          !element.isConnected ||
          !element.getClientRects().length ||
          element.closest('[inert]')
        )
          return;
        element.focus({ preventScroll: true });
        if (document.activeElement !== element) return;
        element.select();
        searchFocus.value = undefined;
      };
      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(focus);
      });
      observer.observe(element);
      cleanup(() => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      });
      focus();
    },
    { flush: 'post', immediate: true },
  );
}
