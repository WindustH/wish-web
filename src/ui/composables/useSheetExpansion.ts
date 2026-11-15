import { onBeforeUnmount, ref, watch } from 'vue';

/** Two reading heights, controlled only by the sheet's handle, never its content. */
export function useSheetExpansion(
  element: () => HTMLElement | null | undefined,
  enabled: () => boolean,
  close: () => void,
) {
  const expanded = ref(false);
  const height = ref<number>();
  const dragging = ref(false);
  let gesture:
    { id: number; y: number; start: number; min: number; max: number; dy: number; handle: HTMLElement } | undefined;
  let suppressClick = false;

  function release() {
    const previous = gesture;
    if (!previous) return;
    gesture = undefined;
    dragging.value = false;
    height.value = undefined;
    const el = element();
    if (el) el.style.translate = '';
    if (previous.handle.hasPointerCapture(previous.id)) previous.handle.releasePointerCapture(previous.id);
  }
  function start(event: PointerEvent) {
    const el = element();
    if (!enabled() || !el || event.button !== 0 || !event.isPrimary) return;
    release();
    suppressClick = false;
    const style = getComputedStyle(el);
    const handle = event.currentTarget as HTMLElement;
    gesture = {
      id: event.pointerId,
      y: event.clientY,
      start: el.getBoundingClientRect().height,
      min: parseFloat(style.minHeight),
      max: parseFloat(style.maxHeight),
      dy: 0,
      handle,
    };
    handle.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return;
    gesture.dy = event.clientY - gesture.y;
    if (!dragging.value && Math.abs(gesture.dy) < 8) return;
    dragging.value = true;
    suppressClick = true;
    const requested = gesture.start - gesture.dy;
    height.value = Math.min(gesture.max, Math.max(gesture.min, requested));
    const el = element();
    if (el) el.style.translate = requested < gesture.min ? `0 ${gesture.min - requested}px` : '';
  }
  function end(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return;
    move(event);
    const current = gesture;
    const dismiss = dragging.value && current.start - current.dy < current.min - 80;
    if (dragging.value && Math.abs(current.dy) >= 24) expanded.value = current.dy < 0;
    if (dismiss) element()?.style.setProperty('--sheet-drag', `${current.min - current.start + current.dy}px`);
    release();
    if (dismiss) close();
  }
  function toggle(event: MouseEvent) {
    // A pointer drag may finish with a compatibility click. Keyboard activation still works.
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      return;
    }
    expanded.value = !expanded.value;
  }
  function keydown(event: KeyboardEvent) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    expanded.value = event.key === 'ArrowUp' || event.key === 'End';
  }
  function anotherPointer(event: PointerEvent) {
    if (gesture && gesture.id !== event.pointerId) {
      suppressClick = true;
      release();
    }
  }
  watch(enabled, (active) => {
    if (!active) release();
  });
  window.addEventListener('resize', release);
  window.visualViewport?.addEventListener('resize', release);
  window.addEventListener('blur', release);
  window.addEventListener('pointerdown', anotherPointer, true);
  onBeforeUnmount(() => {
    release();
    window.removeEventListener('resize', release);
    window.visualViewport?.removeEventListener('resize', release);
    window.removeEventListener('blur', release);
    window.removeEventListener('pointerdown', anotherPointer, true);
  });
  return { expanded, height, dragging, start, move, end, cancel: release, toggle, keydown };
}
