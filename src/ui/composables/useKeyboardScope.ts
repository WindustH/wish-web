import { watch, type Ref } from 'vue';

/** Keyboard commands belong to the focused DOM region. Children handle keys first;
 * a handled command never reaches its parent or application shortcuts.
 * Teleported surfaces register their own root instead of borrowing their opener's scope.
 */
export function useKeyboardScope(
  root: Ref<HTMLElement | null>,
  handle: (event: KeyboardEvent) => boolean,
) {
  watch(root, (element, _, onCleanup) => {
    if (!element) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (!handle(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener('keydown', onKey);
    onCleanup(() => element.removeEventListener('keydown', onKey));
  }, { flush: 'post' });
}
