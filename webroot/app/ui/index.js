// UI root: shell + router outlet + global overlays.
import { html, Fragment } from './h.js';
import { useSignal } from './hooks.js';
import { current } from './router.js';
import { AppShell, OfflineBanner } from './layout/appshell.js';

export function App() {
  const route = useSignal(current);
  const View = route.view;
  return html`
    <${AppShell}>
      <${OfflineBanner} />
      ${View ? html`<${View} key=${route.path} route=${route} />`
             : html`<div class="page"><div class="page-head"><h1>404</h1></div></div>`}
    <//>
  `;
}
