// PWA registration via the plugin's virtual module (prompt semantics: a new
// worker waits for explicit user confirmation; no auto reloads mid-session).
// registerSW returns the official updateSW(reloadPage?). Every failure path
// is user-visible (console AND toast) — nothing is swallowed (round-3 #3).
import { shallowRef, watch } from 'vue';
import { i18n } from '../core/i18n/index.ts';
import { toast } from './toast.ts';
import { sync } from '../core/state/syncSlice.ts';

export const needRefresh = shallowRef(false);
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

// Hash routing never reloads the document, so the browser's own update checks
// (navigation/activation) never fire: a tab left open stays on the old build
// until it is closed. The app must ask the SW itself when something suggests
// the world may have moved on — coming back to the tab, or the control-plane
// stream reconnecting after a gap. Throttled so a flapping connection cannot
// storm the server with worker requests.
let registration: ServiceWorkerRegistration | null = null;
let lastUpdateCheck = 0;
const UPDATE_CHECK_MIN_MS = 5 * 60 * 1000;

function maybeCheckForUpdate() {
  if (!registration) return;
  if (Date.now() - lastUpdateCheck < UPDATE_CHECK_MIN_MS) return;
  lastUpdateCheck = Date.now();
  registration.update().catch((err: unknown) => console.warn('[pwa] update check failed:', err));
}

export async function initPWA() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  try {
    const mod = await import('virtual:pwa-register');
    updateSW = mod.registerSW({
      immediate: true,
      onNeedRefresh() { needRefresh.value = true; },
      // The plugin registers asynchronously: the registration handle arrives
      // here, not from a getRegistration() race right after the call.
      onRegisteredSW(_url: string, r?: ServiceWorkerRegistration) { registration = r ?? null; },
      onRegisterError(err: unknown) {
        console.error('[pwa] registration error:', err);
        toast(i18n.t('pwa.registerFailed'));
      },
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') maybeCheckForUpdate();
    });
    // Revision 1 is the initial snapshot; a later one means the stream
    // re-established after a drop — exactly when an update may have deployed.
    watch(() => sync.snapshotRevision.value, (rev) => { if (rev > 1) maybeCheckForUpdate(); });
  } catch (err) {
    console.error('[pwa] registration module failed:', err);
    toast(i18n.t('pwa.registerFailed'));
  }
}

export function refreshApp() {
  if (!updateSW) return;
  updateSW(true)   // reload once the new worker takes over
    .catch((err: unknown) => {
      console.error('[pwa] update failed:', err);
      toast(i18n.t('pwa.updateFailed'));
    });
}
