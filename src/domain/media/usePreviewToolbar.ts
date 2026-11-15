import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';

// A narrow preview keeps its controls below the title, leaving room for the
// filename, menu and close button. Header width is independent of its children.
export function usePreviewToolbar(toolbar: MaybeRefOrGetter<HTMLElement | undefined>) {
  const mobile = useIsMobile();
  const headerWidth = ref(Infinity);
  watch(
    () => toValue(toolbar),
    (target, _, cleanup) => {
      const header = target?.parentElement;
      headerWidth.value = header?.clientWidth ?? Infinity;
      if (!header) return;
      const observer = new ResizeObserver(() => {
        headerWidth.value = header.clientWidth;
      });
      observer.observe(header);
      cleanup(() => observer.disconnect());
    },
    { immediate: true, flush: 'post' },
  );
  return computed(() => !toValue(toolbar) || mobile.value || headerWidth.value < 520);
}
