// Bootstrap: platform → core (theme/i18n/prefs/sync) → UI. Feature
// installation is data-driven; nothing here knows about specific screens.
import { registerBrowserPlatform } from './platform/browser/index.js';
import { theme } from './core/theme/index.js';
import { i18n } from './core/i18n/index.js';
import { cfg } from './core/config.js';
import { prefs } from './core/state/prefsSlice.js';
import { sync } from './core/state/syncSlice.js';
import { applyTokens } from './ui/applyTokens.js';
import { startRouter } from './ui/router.js';
import { installFeatures } from './ui/features/registry.js';
import { App } from './ui/index.js';
import { render, html } from './ui/h.js';
import { installShortcuts } from './ui/shortcuts.js';

registerBrowserPlatform();
applyTokens();
prefs.load();

// theme: system watch + apply resolved + meta theme-color sync
const mq = matchMedia('(prefers-color-scheme: dark)');
theme.init({
  storageAdapter: (await import('./platform/index.js')).tryPlatform('storage'),
  watchSystem: (cb) => mq.addEventListener('change', cb),
  readSystem: () => (mq.matches ? 'dark' : 'light'),
});
const applyTheme = () => {
  document.documentElement.dataset.theme = theme.resolved.peek();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme.resolved.peek() === 'dark' ? '#1c1b19' : '#faf9f7';
};
theme.resolved.subscribe(applyTheme);
applyTheme();

// i18n: persisted locale + <html lang> sync
{
  const storage = (await import('./platform/index.js')).tryPlatform('storage');
  const saved = storage?.get('locale');
  if (saved && cfg.i18n.locales.includes(saved)) i18n.setLocale(saved);
  i18n.locale.subscribe((l) => {
    document.documentElement.lang = l;
    storage?.set('locale', l);
  });
  document.documentElement.lang = i18n.locale.peek();
}

installFeatures();
const { applySavedListWidth } = await import('./ui/features/sessions/resize.js');
applySavedListWidth();
startRouter();
sync.start();
// A malformed control-plane frame is a protocol violation — surface it once
// per occurrence instead of silently treating it as an empty payload.
{
  const { toast } = await import('./ui/components/toast.js');
  const { i18n } = await import('./core/i18n/index.js');
  sync.protocolError.subscribe((err) => { if (err) toast(i18n.t('sync.protocolError')); });
}

// keep-awake while a run is active (mobile setting)
{
  const { chat } = await import('./core/state/chatSlice.js');
  const { tryPlatform } = await import('./platform/index.js');
  const app = tryPlatform('app');
  chat.stream.subscribe((s) => {
    if (app?.keepAwake && prefs.keepAwake.peek()) app.keepAwake(Boolean(s?.active));
  });
}

render(html`<${App} />`, document.getElementById('app'));
installShortcuts({
  openNewSession: async () => {
    const { NewSessionModal } = await import('./ui/features/sessions/newsession.js');
    NewSessionModal.open();
  },
});

// PWA registration (structure reserved; offline strategy is cache-shell)
if (cfg.pwa.register && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register(cfg.pwa.swPath).catch(() => {});
}
