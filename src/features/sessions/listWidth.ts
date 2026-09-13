// Desktop-only drag handle that resizes the sessions list pane; width is
// clamped to cfg.design bounds and persisted per device.
import { cfg } from '../../core/config.js';
import { tryPlatform } from '../../platform/index.js';

const KEY = 'pref.listWidth';
const clamp = (w: number) => Math.min(cfg.design.sessionListWidthMax,
  Math.max(cfg.design.sessionListWidthMin, Math.round(w)));

export function applySavedListWidth() {
  const saved = Number(tryPlatform('storage')?.get(KEY));
  if (saved >= cfg.design.sessionListWidthMin && saved <= cfg.design.sessionListWidthMax) {
    document.documentElement.style.setProperty('--w-list', `${saved}px`);
  }
}

export function onListResizePointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  document.documentElement.classList.add('resizing');
  const startX = e.clientX;
  const startW = document.querySelector('.sessions-pane')?.getBoundingClientRect().width
    ?? cfg.design.sessionListWidth;
  const widthAt = (ev: PointerEvent) => clamp(startW + (ev.clientX - startX));

  // Drag end listens on window: the 7px handle can lose pointer capture (or
  // leave the document) mid-drag, and a pointerup delivered anywhere else
  // would leave `resizing` on <html>, where it keeps .chatlog and .sl-scroll
  // at pointer-events: none — the whole page looks frozen. A release outside
  // the window delivers no pointerup at all, so the next move with the
  // button already up ends the drag too (same recovery as ChatLog).
  function end(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) return;
    document.documentElement.classList.remove('resizing');
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    tryPlatform('storage')?.set(KEY, String(widthAt(ev)));
  }
  function move(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) return;
    if (!(ev.buttons & 1)) { end(ev); return; }
    document.documentElement.style.setProperty('--w-list', `${widthAt(ev)}px`);
  }
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
}
