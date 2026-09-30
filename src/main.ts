// Bootstrap: platform → core (theme/i18n/prefs/sync) → Vue app.
import { createApp, watch } from 'vue';
import { registerBrowserPlatform } from './platform/browser/index.ts';
import { tryPlatform } from './platform/index.ts';
import { platform } from './platform/index.ts';
import { theme } from './core/theme/index.ts';
import { i18n } from './core/i18n/index.ts';
import { prefs } from './core/state/prefsSlice.ts';
import { sync } from './core/state/syncSlice.ts';
import { toast } from './ui/toast.ts';
import { applyTokens } from './ui/applyTokens.ts';
import { initPWA } from './ui/pwa.ts';
import { installShortcuts } from './features/shell/shortcuts.ts';
import App from './App.vue';
import { router } from './router.ts';
import { applyConnection, isSignedOut } from './core/connection.ts';

import './generated/fonts/montserrat.css';
import './generated/fonts/bitter.css';
import './generated/fonts/sarasa.css';
import './generated/fonts/maple.css';
import './styles/math.css';
import '@fontsource-variable/noto-serif-sc';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/features.css';
import { MOBILE_QUERY } from './ui/composables/useMedia.ts';

applyTokens();
registerBrowserPlatform();
applyConnection();
prefs.load();

// The app supplies its own message actions; unused browser context menus
// should not appear on right-click or touch hold elsewhere in the UI. Parts
// with a context menu of their own (marked data-context-menu) take the event
// themselves, and suppress the browser's too, even where theirs does not open.
document.addEventListener('contextmenu', event => {
  if (!(event.target instanceof Element && event.target.closest('[data-context-menu]'))) event.preventDefault();
}, true);
document.addEventListener('selectstart', event => {
  if (matchMedia(MOBILE_QUERY).matches && event.target instanceof Element && event.target.closest('.chatlog')) {
    event.preventDefault();
  }
}, true);

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
  if (meta) (meta as HTMLMetaElement).content = r === 'dark' ? '#1c1c1c' : '#f6f5f2';
}, { immediate: true });

// i18n: the chosen language, or the browser's; <html lang> follows the one shown.
i18n.init({
  storageAdapter: tryPlatform('storage'),
  readSystem: () => navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean),
  watchSystem: (cb: () => void) => addEventListener('languagechange', cb),
});
watch(i18n.locale, (l) => { document.documentElement.lang = l; }, { immediate: true });

// Background notifier FIRST: its sync.snapshot baseline must be established
// before the control plane starts streaming.
// Signed out, the sign-in page picks a server first.
if (!isSignedOut()) {
  const { installBackgroundNotify } = await import('./ui/notify.ts');
  installBackgroundNotify();
  sync.start();
}

// Malformed control-plane frame → one visible toast per occurrence.
watch(sync.protocolError, (err) => { if (err) toast(i18n.t('sync.protocolError')); });

// keep-awake while a run is active (mobile setting)
{
  const { chat } = await import('./core/state/chatSlice.ts');
  const app = platform('app');
  watch([() => chat.stream.value.active, prefs.keepAwake], ([active, enabled]) => {
    void app.keepAwake(active && enabled);
  });
}

const app = createApp(App);
app.use(router);
app.mount('#app');

installShortcuts({
  openNewSession: () => { void router.push('/new'); },
});

initPWA();
