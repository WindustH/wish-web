// PWA registration via the plugin's virtual module (prompt semantics: a new
// worker waits for explicit user confirmation; no auto reloads mid-session).
// registerSW returns the official updateSW(reloadPage?). Every failure path
// is user-visible (console AND toast) — nothing is swallowed (round-3 #3).
import { shallowRef } from 'vue';
import { i18n } from '../core/i18n/index.js';
import { toast } from './toast.js';

export const needRefresh = shallowRef(false);
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export async function initPWA() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  try {
    const mod = await import('virtual:pwa-register');
    updateSW = mod.registerSW({
      immediate: true,
      onNeedRefresh() { needRefresh.value = true; },
      onRegisterError(err: unknown) {
        console.error('[pwa] registration error:', err);
        toast(i18n.t('pwa.registerFailed'));
      },
    });
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
