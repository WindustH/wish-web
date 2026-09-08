// Side sheet: desktop = right-hand drawer (chat stays visible and
// interactive, no blocking scrim); mobile = second-level page with a back
// bar. Closing both = history.back() (these are routes).
import { html } from '../h.js';
import { useRef, useEffect } from 'preact/hooks';
import { useMedia, useEscape } from '../hooks.js';
import { Icon } from './icon.js';
import { Button } from './button.js';
import { cfg } from '../../core/config.js';
import { i18n } from '../../core/i18n/index.js';

export function Sheet({ title, actions, children }) {
  const isDesktop = useMedia(`(min-width: ${cfg.breakpoints.desktop}px)`);
  const close = () => history.back();
  if (isDesktop) {
    return html`<${Drawer} title=${title} actions=${actions} onClose=${close}>${children}<//>`;
  }
  return html`<${SheetPage} title=${title} onBack=${close} actions=${actions}>${children}<//>`;
}

function Drawer({ title, actions, onClose, children }) {
  const ref = useRef(null);
  useEscape(onClose);
  // click outside the drawer closes it; the chat behind stays usable
  useEffectOutside(ref, onClose);
  // move focus INTO the drawer when it opens (the chat behind stays
  // reachable — this is a focus start point, not a trap)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement;
    const target = el.querySelector('[autofocus]') || el.querySelector('input, textarea, button') || el;
    target.focus?.({ preventScroll: true });
    return () => { if (prev && document.contains(prev)) prev.focus?.({ preventScroll: true }); };
  }, []);
  return html`<aside class="drawer" ref=${ref} role="complementary" aria-label=${title}>
    <div class="drawer-head">
      <h2>${title}</h2>
      <div style="display:flex;gap:4px;align-items:center">
        ${actions}
        <button class="btn ghost icon-only" aria-label=${i18n.t('common.close')} onClick=${onClose}><${Icon} name="x" /></button>
      </div>
    </div>
    <div class="sheet-body">${children}</div>
  </aside>`;
}

function SheetPage({ title, onBack, actions, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement;
    const target = el.querySelector('[autofocus]') || el.querySelector('input, textarea, button') || el;
    target.focus?.({ preventScroll: true });
    return () => { if (prev && document.contains(prev)) prev.focus?.({ preventScroll: true }); };
  }, []);
  return html`<div class="page sheet-page" ref=${ref}>
    <div class="page-head">
      <button class="btn ghost icon-only" aria-label=${i18n.t('common.back')} onClick=${onBack}>
        <${Icon} name="arrow-left" />
      </button>
      <h1>${title}</h1>
      ${actions}
    </div>
    <div class="sheet-body">${children}</div>
  </div>`;
}

function useEffectOutside(ref, onClose) {
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.chatbar')) {
        onClose();
      }
    };
    // mousedown-phase so a drag started in chat doesn't close the drawer
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, onClose]);
}
