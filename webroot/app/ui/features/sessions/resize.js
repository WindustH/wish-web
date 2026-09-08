// Desktop-only drag handle that resizes the sessions list pane.
// Width is clamped to cfg.design bounds and persisted through the platform
// storage adapter (survives reloads; per-device, not synced — see from-llm/20).
import { html } from '../../h.js';
import { useEffect } from 'preact/hooks';
import { cfg } from '../../../core/config.js';
import { tryPlatform } from '../../../platform/index.js';

const KEY = 'pref.listWidth';
const clamp = (w) => Math.min(cfg.design.sessionListWidthMax,
  Math.max(cfg.design.sessionListWidthMin, Math.round(w)));

export function applySavedListWidth() {
  const saved = Number(tryPlatform('storage')?.get(KEY));
  if (saved >= cfg.design.sessionListWidthMin && saved <= cfg.design.sessionListWidthMax) {
    document.documentElement.style.setProperty('--w-list', `${saved}px`);
  }
}

export function ListResizeHandle() {
  useEffect(applySavedListWidth, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('resizing');
    const startX = e.clientX;
    const startW = document.querySelector('.sessions-pane')?.getBoundingClientRect().width
      ?? cfg.design.sessionListWidth;

    const move = (ev) => {
      const w = clamp(startW + (ev.clientX - startX));
      document.documentElement.style.setProperty('--w-list', `${w}px`);
    };
    const up = (ev) => {
      target.releasePointerCapture?.(ev.pointerId);
      document.documentElement.classList.remove('resizing');
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      const w = clamp(startW + (ev.clientX - startX));
      tryPlatform('storage')?.set(KEY, String(w));
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return html`<div class="list-resize" role="separator" aria-orientation="vertical"
    onPointerDown=${onPointerDown} title="↔" />`;
}
