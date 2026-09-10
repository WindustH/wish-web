// Bootstrap: platform → core (theme/i18n/prefs/sync) → Vue app.
import { createApp, watch } from 'vue';
import { registerBrowserPlatform } from './platform/browser/index.js';
import { tryPlatform } from './platform/index.js';
import { platform } from './platform/index.js';
import { theme } from './core/theme/index.js';
import { i18n } from './core/i18n/index.js';
import { cfg } from './core/config.js';
import { prefs } from './core/state/prefsSlice.js';
import { sync } from './core/state/syncSlice.js';
import { bus } from './core/bus.js';
import { toast } from './ui/toast.js';
import { applyTokens } from './ui/applyTokens';
import { initPWA } from './ui/pwa.js';
import { installShortcuts } from './ui/shortcuts.js';
import App from './App.vue';
import { router } from './router.js';

import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/features.css';

applyTokens();
registerBrowserPlatform();
prefs.load();

// theme: system watch + apply resolved + meta theme-color sync
const mq = matchMedia('(prefers-color-scheme: dark)');
theme.init({
  storageAdapter: tryPlatform('storage'),
  watchSystem: (cb: () => void) => mq.addEventListener('change', cb),
  readSystem: () => (mq.matches ? 'dark' : 'light'),
});
watch(theme.resolved, (r) => {
  document.documentElement.dataset.theme = r;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) (meta as HTMLMetaElement).content = r === 'dark' ? '#20221f' : '#fbfaf7';
}, { immediate: true });

// i18n: persisted locale + <html lang> sync
{
  const storage = tryPlatform('storage');
  const saved = storage?.get('locale');
  if (saved && cfg.i18n.locales.includes(saved)) i18n.setLocale(saved as 'zh' | 'en');
  watch(i18n.locale, (l) => {
    document.documentElement.lang = l;
    storage?.set('locale', l);
  }, { immediate: true });
}

// Background notifier FIRST: its sync.snapshot baseline must be established
// before the control plane starts streaming.
{
  const { installBackgroundNotify } = await import('./ui/notify.js');
  installBackgroundNotify();
}
sync.start();

// Malformed control-plane frame → one visible toast per occurrence.
watch(sync.protocolError, (err) => { if (err) toast(i18n.t('sync.protocolError')); });
// Generation cutover (compaction switch) → one clear message.
bus.on('chat.generationChanged', () => toast(i18n.t('chat.generationChanged')));

// keep-awake while a run is active (mobile setting)
{
  const { chat } = await import('./core/state/chatSlice.js');
  const app = platform('app');
  watch(chat.stream, (s) => {
    if (app?.keepAwake && prefs.keepAwake.value) app.keepAwake(Boolean(s?.active));
  });
}

const app = createApp(App);
app.use(router);
app.mount('#app');

installShortcuts({
  openNewSession: async () => {
    const { openNewSession } = await import('./features/sessions/newSessionBus.js');
    openNewSession();
  },
});

initPWA();
