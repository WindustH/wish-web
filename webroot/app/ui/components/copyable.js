import { html } from '../h.js';
import { Icon } from './icon.js';
import { toastCopied } from './toast.js';
import { i18n } from '../../core/i18n/index.js';

export function CopyButton({ text, label }) {
  return html`<button class="act" title=${i18n.t('chat.copy')}
    onClick=${(e) => {
      e.stopPropagation();
      const done = () => toastCopied();
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done);
      else done();
    }}>
    <${Icon} name="copy" class="sm" />${label || i18n.t('chat.copy')}
  </button>`;
}
