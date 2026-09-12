import { onMounted, onScopeDispose, ref } from 'vue';

/** Keep the layout stable until an in-progress pointer click has dispatched. */
export function useComposerFocus() {
  const focused = ref(false);
  let pointerDown = false;
  let wasComposer = false;
  let keyboardSeen = false;
  let keyboardDismissed = false;
  let fullHeight = 0;
  let viewportWidth = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const isComposer = () => document.activeElement?.matches('.composer textarea') ?? false;
  function sync() {
    clearTimeout(timer);
    const current = isComposer();
    if (current !== wasComposer) {
      keyboardSeen = false;
      keyboardDismissed = false;
    }
    wasComposer = current;
    focused.value = current && !keyboardDismissed;
  }
  function afterInteraction() {
    clearTimeout(timer);
    timer = setTimeout(sync, 0);
  }
  function focusChanged() {
    if (isComposer()) sync();
    else if (!pointerDown) afterInteraction();
  }
  function press(event: PointerEvent) {
    pointerDown = true;
    if (event.target instanceof Element && event.target.matches('.composer textarea')) {
      keyboardDismissed = false;
      if (isComposer()) sync();
    }
  }
  function viewportChanged() {
    const viewport = window.visualViewport;
    if (!viewport || viewport.scale !== 1) return;
    if (Math.abs(viewport.width - viewportWidth) > 80) {
      fullHeight = viewport.height;
      keyboardSeen = false;
    }
    viewportWidth = viewport.width;
    fullHeight = Math.max(fullHeight, viewport.height);
    if (!isComposer()) return;
    if (fullHeight - viewport.height > 100) {
      keyboardSeen = true;
      keyboardDismissed = false;
      focused.value = true;
    } else if (keyboardSeen && fullHeight - viewport.height < 80) {
      keyboardSeen = false;
      keyboardDismissed = true;
      if (!pointerDown) focused.value = false;
    }
  }
  function release() { pointerDown = false; afterInteraction(); }
  onMounted(() => {
    viewportChanged();
    window.visualViewport?.addEventListener('resize', viewportChanged);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('focusout', focusChanged);
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    sync();
  });
  onScopeDispose(() => {
    clearTimeout(timer);
    window.visualViewport?.removeEventListener('resize', viewportChanged);
    document.removeEventListener('focusin', focusChanged);
    document.removeEventListener('focusout', focusChanged);
    document.removeEventListener('pointerdown', press, true);
    document.removeEventListener('pointerup', release, true);
    document.removeEventListener('pointercancel', release, true);
  });
  return focused;
}
