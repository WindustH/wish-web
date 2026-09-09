// True centered modal on a NATIVE <dialog> (2026-09-10 decision #2):
// showModal() puts it in the browser top layer, so the overlay covers the
// whole viewport regardless of the Sheet's transform (fixed inside a
// transformed ancestor is clipped — native dialog has no such limit).
// Escape semantics come for free: the cancel event fires on the TOPMOST
// dialog only, so a confirm dialog never closes the Sheet behind it. Focus
// trap and focus restoration are native as well.
import { html } from '../h.js';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './icon.js';
import { i18n } from '../../core/i18n/index.js';

export function Modal({ title, onClose, children, footer, wide = false, dismissable = true }) {
  const ref = useRef(null);
  // The effect mounts once with the dialog; keep the CURRENT close callback
  // and the CURRENT dismissability in refs so a busy dialog opened by an
  // earlier render can't be dismissed by a stale closure.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissable);
  dismissRef.current = dismissable;
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    // Route Escape through onClose so callers keep one close path; native
    // cancel only reaches the topmost dialog.
    const onCancel = (e) => { e.preventDefault(); if (dismissRef.current) closeRef.current(); };
    // Click on the backdrop (the dialog element itself, outside its card):
    const onBackdrop = (e) => { if (e.target === dlg && dismissRef.current) closeRef.current(); };
    dlg.addEventListener('cancel', onCancel);
    dlg.addEventListener('click', onBackdrop);
    return () => {
      dlg.removeEventListener('cancel', onCancel);
      dlg.removeEventListener('click', onBackdrop);
      if (dlg.open) dlg.close();
    };
  }, []);
  return html`<dialog class="modal-root ${wide ? 'wide' : ''}" ref=${ref} aria-label=${title}>
    <div class="modal detail-modal">
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="btn ghost icon-only" disabled=${!dismissable} onClick=${() => dismissable && onClose()} aria-label=${i18n.t('common.close')}>
          <${Icon} name="x" />
        </button>
      </div>
      <div class="modal-body">${children}</div>
      ${footer && html`<div class="modal-foot">${footer}</div>`}
    </div>
  </dialog>`;
}
