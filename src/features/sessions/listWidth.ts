// Desktop-only drag handle that resizes the sessions list pane; width is
// clamped to cfg.design bounds and persisted per device.
import { ref } from 'vue';
import { cfg } from '../../core/config.ts';
import { tryPlatform } from '../../platform/index.ts';

export const listWidth = ref<number>(cfg.design.sessionListWidth);
function applyWidth(value: number) {
  listWidth.value = clamp(value);
  document.documentElement.style.setProperty('--w-list', `${listWidth.value}px`);
}
export function onListResizeKeyDown(event: KeyboardEvent) {
  const { sessionListWidthMin: min, sessionListWidthMax: max } = cfg.design;
  const width = (
    { ArrowLeft: listWidth.value - 16, ArrowRight: listWidth.value + 16, Home: min, End: max } as Record<string, number>
  )[event.key];
  if (width === undefined) return;
  event.preventDefault();
  cancelListResize();
  applyWidth(width);
  tryPlatform('storage')?.set(KEY, String(listWidth.value));
}

const KEY = 'pref.listWidth';
const clamp = (w: number) =>
  Math.min(cfg.design.sessionListWidthMax, Math.max(cfg.design.sessionListWidthMin, Math.round(w)));
let cancelActiveResize: (() => void) | undefined;

export function cancelListResize() {
  cancelActiveResize?.();
  // Also clear a class left by an interrupted drag from an older page state.
  document.documentElement.classList.remove('resizing');
}

export function applySavedListWidth() {
  const saved = Number(tryPlatform('storage')?.get(KEY));
  if (saved >= cfg.design.sessionListWidthMin && saved <= cfg.design.sessionListWidthMax) {
    applyWidth(saved);
  }
}

export function onListResizePointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  cancelListResize();
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  document.documentElement.classList.add('resizing');
  const startX = e.clientX;
  const startW = document.querySelector('.sessions-pane')?.getBoundingClientRect().width ?? cfg.design.sessionListWidth;
  const widthAt = (ev: PointerEvent) => clamp(startW + (ev.clientX - startX));

  function finish(save: boolean, value = startW) {
    if (!cancelActiveResize) return;
    cancelActiveResize = undefined;
    document.documentElement.classList.remove('resizing');
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', pointerCancel, true);
    window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', visibility);
    target.removeEventListener('lostpointercapture', lostCapture);
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    if (save) tryPlatform('storage')?.set(KEY, String(value));
    applyWidth(save ? value : startW);
  }
  function end(ev: PointerEvent) {
    if (ev.pointerId === e.pointerId) finish(true, widthAt(ev));
  }
  function cancel() {
    finish(false);
  }
  function pointerCancel(ev: PointerEvent) {
    if (ev.pointerId === e.pointerId) cancel();
  }
  function lostCapture() {
    finish(false);
  }
  function visibility() {
    if (document.hidden) cancel();
  }
  function move(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) return;
    if (!(ev.buttons & 1)) {
      end(ev);
      return;
    }
    applyWidth(widthAt(ev));
  }
  cancelActiveResize = () => finish(false);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', pointerCancel, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', visibility);
  target.addEventListener('lostpointercapture', lostCapture);
}
