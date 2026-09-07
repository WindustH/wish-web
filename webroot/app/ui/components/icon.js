// Icon component rendering vendored Lucide markup (see ui/icons.js).
import { html } from '../h.js';
import { ICONS } from '../icons.js';

export function Icon({ name, size, class: cls = '' }) {
  const def = ICONS[name];
  if (!def) {
    console.warn(`[icon] missing: ${name}`);
    return html`<span class="icon ${cls}" data-missing="${name}" />`;
  }
  const attrs = { ...parseAttrs(def.attrs), width: size || 'var(--icon)', height: size || 'var(--icon)' };
  return html`<svg ...${attrs} class="icon ${cls}" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: def.inner }} />`;
}

function parseAttrs(str) {
  const out = {};
  const re = /([a-zA-Z-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(str))) out[m[1]] = m[2];
  return out;
}
