import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { virtualWindow } from '../virtualWindow.ts';

// Cards have a 4:3 preview and two fixed text lines. Resize and scroll only update
// the visible row window; objects and preview caches remain owned by the caller.
export function useVirtualGrid(viewport: Ref<HTMLElement | undefined>, count: Ref<number>) {
  const width = ref(280),
    height = ref(480),
    offset = ref(0);
  const columns = computed(() => Math.max(1, Math.floor((width.value + 12) / 124)));
  const rowSize = computed(() =>
    Math.ceil(Math.min(180, (width.value - (columns.value - 1) * 12) / columns.value) * 0.75 + 62),
  );
  const range = computed(() =>
    virtualWindow(Math.ceil(count.value / columns.value), rowSize.value, height.value, offset.value),
  );
  const start = computed(() => range.value.start * columns.value);
  const end = computed(() => Math.min(count.value, range.value.end * columns.value));
  const style = computed(() => ({
    gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))`,
    gridAutoRows: `${rowSize.value - 18}px`,
    paddingTop: `${range.value.start * rowSize.value}px`,
    paddingBottom: `${Math.max(0, range.value.total - range.value.end * rowSize.value)}px`,
  }));
  let observer: ResizeObserver | undefined;
  function onScroll() {
    if (viewport.value) offset.value = viewport.value.scrollTop;
  }
  function reset() {
    offset.value = 0;
    if (viewport.value) viewport.value.scrollTop = 0;
  }
  watch(
    viewport,
    (element, _, cleanup) => {
      if (!element) return;
      const measure = () => {
        if (!element.clientWidth || !element.clientHeight) return;
        const css = getComputedStyle(element);
        width.value = element.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
        height.value = element.clientHeight;
      };
      measure();
      element.scrollTop = offset.value;
      element.addEventListener('scroll', onScroll, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(element);
      }
      cleanup(() => {
        observer?.disconnect();
        element.removeEventListener('scroll', onScroll);
      });
    },
    { flush: 'post' },
  );
  watch(count, () => {
    if (start.value >= count.value) reset();
  });
  onBeforeUnmount(() => observer?.disconnect());
  return { start, end, style, reset };
}
