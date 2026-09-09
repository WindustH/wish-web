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

  const move = (ev: PointerEvent) => {
    document.documentElement.style.setProperty('--w-list', `${clamp(startW + (ev.clientX - startX))}px`);
  };
  const up = (ev: PointerEvent) => {
    target.releasePointerCapture?.(ev.pointerId);
    document.documentElement.classList.remove('resizing');
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    tryPlatform('storage')?.set(KEY, String(clamp(startW + (ev.clientX - startX))));
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}
