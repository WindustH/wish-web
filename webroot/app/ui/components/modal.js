import { html } from '../h.js';
import { useEscape } from '../hooks.js';
import { Icon } from './icon.js';
import { i18n } from '../../core/i18n/index.js';

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEscape(onClose);
  return html`<div class="scrim" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="modal ${wide ? 'wide' : ''} detail-modal" role="dialog" aria-modal="true" aria-label=${title}>
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
