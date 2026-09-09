// PWA explicit-update registration (vite-plugin-pwa generates dist/sw.js with
// injectRegister:false; we register it manually — no workbox-window build-time
// import). Semantics follow the prompt-style update flow: a new worker that
// finished installing while we already have a controller raises `needRefresh`;
// the user decides when to activate it (never auto-reloads mid-session).
import { shallowRef } from 'vue';

export const needRefresh = shallowRef(false);
const offlineReady = shallowRef(false);
let applying = false;

export function refreshApp() {
  if (applying) return;
  applying = true;
  navigator.serviceWorker.getRegistration()
    .then((reg) => {
      const waiting = reg?.waiting;
      if (!waiting) return;
      waiting.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // one-shot: the new shell took over — reload exactly once
        if (!applying) return;
        applying = false;
        window.location.reload();
      });
    })
    .catch(() => { applying = false; });
}

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        needRefresh.value = true;
        return;
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state !== 'installed') return;
          if (navigator.serviceWorker.controller) needRefresh.value = true;
          else offlineReady.value = true;
        });
      });
    })
    .catch((err) => console.warn('[pwa] register failed:', err));
}
