// A route-backed overlay: right drawer on desktop, full-width on mobile.
// Its absolute positioning never changes the conversation's layout.
import { html } from '../h.js';
import { useRef, useEffect, useState, useCallback } from 'preact/hooks';
import { useEscape } from '../hooks.js';
import { Icon } from './icon.js';
import { i18n } from '../../core/i18n/index.js';

export function Sheet({ title, actions, children, mobile, onClose }) {
  const ref = useRef(null);
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => setClosing(true), []);
  useEscape(close);
  useEffect(() => {
    const el = ref.current;
    const prev = document.activeElement;
    (el.querySelector('[autofocus]') || el.querySelector('input, textarea, button')).focus({ preventScroll: true });
    const outside = e => {
      // An open native dialog owns the top layer: outside-pointerdown must
      // not dismiss the sheet underneath it.
      if (document.querySelector('dialog[open]')) return;
      if (!el.contains(e.target) && !e.target.closest('.chatbar, .composer-toolbar')) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [close]);
  return html`<aside class="session-sheet ${mobile ? 'sheet-page' : 'drawer'} ${closing ? 'closing' : ''}"
    ref=${ref} role="complementary" aria-label=${title}
    onAnimationEnd=${e => { if (closing && e.target === e.currentTarget) onClose(); }}>
    <div class=${mobile ? 'page-head' : 'drawer-head'}>
      ${mobile && html`<button class="btn ghost icon-only" onClick=${close} aria-label=${i18n.t('common.back')}>
        <${Icon} name="arrow-left" />
      </button>`}
      <h2>${title}</h2>
      <div class="sheet-actions">
        ${actions}
        ${!mobile && html`<button class="btn ghost icon-only" onClick=${close} aria-label=${i18n.t('common.close')}>
          <${Icon} name="x" />
        </button>`}
      </div>
    </div>
    <div class="sheet-body">${children}</div>
  </aside>`;
}
