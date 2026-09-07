import { html, render } from '../h.js';
import { i18n } from '../../core/i18n/index.js';

let region = null;
const active = new Set();

function ensureRegion() {
  if (region) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  document.body.appendChild(region);
  return region;
}

export function toast(message) {
  const host = ensureRegion();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  active.add(el);
  setTimeout(() => { el.remove(); active.delete(el); }, 2400);
}
export const toastCopied = () => toast(i18n.t('toast.copied'));
export const toastT = (key, params) => toast(i18n.t(key, params));

export function ToastHost() { return null; } // region is imperative; kept for API symmetry
void render;
