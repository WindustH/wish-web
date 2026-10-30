import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue';
/** Reserve the floating composer's measured height in its owning chat pane. */
export function useComposerHeight(pane: Ref<HTMLElement | null>, mobile: Ref<boolean>) {
  let observer: ResizeObserver | undefined;
  const measure = () => {
    observer?.disconnect();
    const root = pane.value;
    const composer = root?.querySelector<HTMLElement>('.composer');
    if (!root || !composer) {
      root?.style.removeProperty('--composer-height');
      return;
    }
    const apply = () => {
      const span = root.getBoundingClientRect().bottom - composer.getBoundingClientRect().top;
      root.style.setProperty('--composer-height', `${Math.round(span)}px`);
    };
    observer = new ResizeObserver(apply);
    observer.observe(composer);
    observer.observe(root);
    apply();
  };
  onMounted(measure);
  watch(mobile, measure, { flush: 'post' });
  onBeforeUnmount(() => observer?.disconnect());
}
