// App shell: desktop = left vertical bar (sessions+stats top, settings
// bottom) + content; mobile = content + bottom bar (all icons, ungrouped).
import { html } from '../h.js';
import { useSignal, useMedia } from '../hooks.js';
import { navigate, current } from '../router.js';
import { Icon } from '../components/icon.js';
import { i18n } from '../../core/i18n/index.js';
import { sync } from '../../core/state/syncSlice.js';
import { FEATURES } from '../features/registry.js';

export function AppShell({ children }) {
  useSignal(sync.state);
  useSignal(current);
  const isMobile = useMedia(`(max-width: ${900 - 1}px)`);

  const navItems = FEATURES.flatMap((f) => f.nav || []);
  const top = navItems.filter((n) => n.position !== 'bottom');
  const bottom = navItems.filter((n) => n.position === 'bottom');

  const isActive = (item) => {
    const p = current.peek().path;
    if (item.exact) return p === item.path;
    return p === item.path || p.startsWith(item.path + '/');
  };
  const go = (item) => navigate(item.path);

  return html`
    <div class="shell ${isMobile ? 'mobile' : 'desktop'}">
      <nav class="vbar" aria-label=${i18n.t('app.name')}>
        ${top.map((item) => html`
          <button key=${item.id} class="nav-btn ${isActive(item) ? 'active' : ''}"
            title=${item.label()} aria-label=${item.label()} onClick=${() => go(item)}>
            <${Icon} name=${item.icon} />
          </button>`)}
        <div class="spacer" />
        ${bottom.map((item) => html`
          <button key=${item.id} class="nav-btn ${isActive(item) ? 'active' : ''}"
            title=${item.label()} aria-label=${item.label()} onClick=${() => go(item)}>
            <${Icon} name=${item.icon} />
          </button>`)}
      </nav>
      <div class="main">${children}</div>
      <nav class="bbar" aria-label=${i18n.t('app.name')}>
        ${navItems.map((item) => html`
          <button key=${item.id} class="nav-btn ${isActive(item) ? 'active' : ''}"
            aria-label=${item.label()} onClick=${() => go(item)}>
            <${Icon} name=${item.icon} />
          </button>`)}
      </nav>
    </div>
  `;
}

export function OfflineBanner() {
  const state = useSignal(sync.state);
  const online = useSignal(sync.online);
  if (online && state !== 'closed') return null;
  return html`<div class="offline-banner" role="status">${i18n.t('settings.offline')}</div>`;
}
