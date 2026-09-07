import { html } from '../h.js';
export function Spinner({ label }) {
  return html`<span style="display:inline-flex;align-items:center;gap:8px">
    <span class="spinner" role="status" aria-label=${label || 'loading'} />
    ${label && html`<span>${label}</span>`}
  </span>`;
}
