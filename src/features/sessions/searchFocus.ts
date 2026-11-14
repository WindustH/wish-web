import { shallowRef, watch, type Ref } from 'vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';

export const searchFocus = shallowRef<{ scope: 'list' | 'chat'; session?: string }>();
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
