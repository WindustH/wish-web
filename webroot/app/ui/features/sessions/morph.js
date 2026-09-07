// morphicons integration: registers <morph-icon> once, exposes `d` path
// data for the send/stop morph pair. Falls back to plain icons — the app
// never depends on the animation to function.
import { Icon } from '../../components/icon.js';
import { html } from '../../h.js';
import { ICONS } from '../../icons.js';

let registered = false;
export function ensureMorphicons() {
  if (registered) return;
  registered = true;
  import('../../../vendor/morphicons/element.js')
    .then((m) => m?.default?.define?.())
    .catch(() => { /* animation is optional */ });
}

function firstPathD(name) {
  const m = (ICONS[name]?.inner || '').match(/d="([^"]+)"/);
  return m ? m[1] : '';
}

export const sendD = firstPathD('send');
export const stopD = 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z';

export function MorphSendButton({ running, onClick, title }) {
  return html`<morph-icon part="btn" icon=${running ? stopD : sendD}
    size="16" label=${title} onClick=${onClick} class="send-btn ${running ? 'stop' : ''}" />`;
}

export function StaticSend({ running }) {
  return html`<${Icon} name=${running ? 'square' : 'send'} />`;
}
