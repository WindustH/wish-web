// Browser app-shell adapter: visibility, PWA install prompt, and wake lock.
// Native shells override with their own adapter.
let deferredPrompt = null;
let wakeLock = null;
let wakeRequest = 0;

export const browserApp = {
  // Background notifications must only fire while the page is hidden —
  // the visible UI is the primary channel (round-4 #2).
  isHidden() {
    return typeof document !== 'undefined' &&
      (document.visibilityState === 'hidden' || document.hidden === true);
  },
  captureInstallPrompt(event) {
    event.preventDefault();
    deferredPrompt = event;
  },
  async promptInstall() {
    const e = deferredPrompt;
    if (!e) return false;
    e.prompt();
    const { outcome } = await e.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  },
  async keepAwake(on) {
    const request = ++wakeRequest;
    try {
      if (!on) {
        const lock = wakeLock;
        wakeLock = null;
        await lock?.release();
      } else if ('wakeLock' in navigator && !wakeLock) {
        const lock = await navigator.wakeLock.request('screen');
        if (request !== wakeRequest) { await lock.release(); return false; }
        wakeLock = lock;
        lock.addEventListener('release', () => {
          if (wakeLock === lock) wakeLock = null;
        }, { once: true });
      }
    } catch (err) { console.warn('[app] wakeLock:', err); }
    return Boolean(wakeLock);
  },
};
