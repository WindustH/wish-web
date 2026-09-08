// Desktop-only drag handle that resizes the sessions list pane.
// Width is clamped to cfg.design bounds and persisted through the platform
// storage adapter (survives reloads; per-device, not synced — see from-llm/20).
import { html } from '../../h.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cfg } from '../../../core/config.js';
import { tryPlatform } from '../../../platform/index.js';
import { i18n } from '../../../core/i18n/index.js';

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

// Preferred height is local to this device; viewport clamps never overwrite it.
const HEIGHT_KEY = 'pref.composerHeight';
export function useComposerHeight(ref, mobile) {
  const [preferred, setPreferred] = useState(() => {
    const saved = Number(tryPlatform('storage')?.get(HEIGHT_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  });
  const [available, setAvailable] = useState(0);
  useLayoutEffect(() => {
    if (mobile) return;
    const container = ref.current.parentElement;
    const update = () => setAvailable(container.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [mobile]);
  const max = Math.round(available * cfg.composer.desktopMaxHeightRatio);
  const min = Math.min(cfg.composer.desktopMinHeight, max);
  const bound = h => Math.min(max, Math.max(min, Math.round(h)));
  const height = bound(preferred ?? available * cfg.composer.desktopHeightRatio);
  const change = h => setPreferred(bound(h));
  const commit = h => { const next = bound(h); setPreferred(next); tryPlatform('storage')?.set(HEIGHT_KEY, String(next)); };
  return {height, min, max, change, commit};
}

export function ComposerResizeHandle({height, min, max, change, commit}) {
  const drag = useRef(null);
  useEffect(() => () => document.documentElement.classList.remove('resizing-composer'), []);
  const finish = (e, cancel = false) => {
    if (!drag.current) return;
    const start = drag.current; drag.current = null;
    if (cancel) change(start.height);
    else commit(start.height + start.y - e.clientY);
    document.documentElement.classList.remove('resizing-composer');
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return html`<div class="composer-resize" role="separator" tabIndex="0"
    aria-orientation="horizontal" aria-label=${i18n.t('composer.resize')}
    aria-valuemin=${min} aria-valuemax=${max} aria-valuenow=${height}
    title=${i18n.t('composer.resize')}
    onPointerDown=${e => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag.current = {y:e.clientY, height};
      e.currentTarget.setPointerCapture(e.pointerId);
      document.documentElement.classList.add('resizing-composer');
    }}
    onPointerMove=${e => { if (drag.current) change(drag.current.height + drag.current.y - e.clientY); }}
    onPointerUp=${e => finish(e)} onPointerCancel=${e => finish(e, true)}
    onKeyDown=${e => {
      if (!['ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
      e.preventDefault();
      commit(e.key === 'Home' ? min : e.key === 'End' ? max
        : height + (e.key === 'ArrowUp' ? 1 : -1) * cfg.composer.resizeStep);
    }} />`;
}
