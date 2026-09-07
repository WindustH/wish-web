import { html } from '../h.js';
import { useRef, useState } from 'preact/hooks';
import { useDismiss, useEscape } from '../hooks.js';
import { Icon } from './icon.js';

export function Menu({ items, align = 'right', trigger }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, () => setOpen(false), open);
  useEscape(() => setOpen(false), open);
  return html`<div class="menu-wrap" ref=${ref}>
    ${trigger
      ? trigger({ open, toggle: () => setOpen((o) => !o) })
      : html`<button class="btn ghost icon-only" aria-haspopup="menu" aria-expanded=${open}
          onClick=${() => setOpen((o) => !o)}><${Icon} name="ellipsis-vertical" /></button>`}
    ${open && html`<div class="menu" role="menu" style=${align === 'left' ? 'left:0;right:auto' : ''}>
      ${items.map((it) => html`<button class="menu-item" role="menuitem" onClick=${() => { setOpen(false); it.onClick?.(); }}>
        ${it.icon && html`<${Icon} name=${it.icon} />`}<span>${it.label}</span>
      </button>`)}
    </div>`}
  </div>`;
}
