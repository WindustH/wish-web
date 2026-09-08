import { html } from '../h.js';
import { useEffect, useRef } from 'preact/hooks';
import { useEscape } from '../hooks.js';
import { Icon } from './icon.js';
import { i18n } from '../../core/i18n/index.js';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// A true modal: focus starts inside, Tab cycles within the dialog, focus is
// restored to the trigger on close (round-4 #5). Unlike the Drawer, the
// content behind is inert, so the cycle is a trap.
export function Modal({ title, onClose, children, footer, wide = false }) {
  useEscape(onClose);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement;
    const target = el.querySelector('[autofocus]') || el.querySelector(FOCUSABLE) || el;
    target.focus?.({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus?.({ preventScroll: true });
    };
  }, []);
  return html`<div class="scrim" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="modal ${wide ? 'wide' : ''} detail-modal" ref=${ref} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="btn ghost icon-only" onClick=${onClose} aria-label=${i18n.t('common.close')}>
          <${Icon} name="x" />
        </button>
      </div>
      <div class="modal-body">${children}</div>
      ${footer && html`<div class="modal-foot">${footer}</div>`}
    </div>
  </div>`;
}
