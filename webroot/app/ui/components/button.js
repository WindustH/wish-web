import { html } from '../h.js';
import { Icon } from './icon.js';

export function Button({ icon, children, variant = '', size = '', ...props }) {
  return html`<button class="btn ${variant} ${size} ${props['icon-only'] != null || !children ? 'icon-only' : ''}" ...${props}>
    ${icon && html`<${Icon} name=${icon} class=${size === 'sm' ? 'sm' : ''} />`}
    ${children}
  </button>`;
}
