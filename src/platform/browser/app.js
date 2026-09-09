// Browser app-shell adapter: PWA install prompt, standalone display
// detection, wake-lock. Native shells override with their own adapter.
export const browserApp = {
  // Background notifications must only fire while the page is hidden —
  // the visible UI is the primary channel (round-4 #2).
  isHidden() {
    return typeof document !== 'undefined' &&
      (document.visibilityState === 'hidden' || document.hidden === true);
  },
  isStandalone() {
    return typeof matchMedia !== 'undefined' &&
      (matchMedia('(display-mode: standalone)').matches ||
        navigator.standalone === true);
  },
  _deferredPrompt: null,
  canInstall() { return browserApp._deferredPrompt !== null; },
  onInstallAvailability(fn) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      browserApp._deferredPrompt = e;
      fn(true);
    });
    return () => {};
  },
  async promptInstall() {
    const e = browserApp._deferredPrompt;
    if (!e) return false;
    e.prompt();
    const { outcome } = await e.userChoice;
    browserApp._deferredPrompt = null;
    return outcome === 'accepted';
  },
  _wakeLock: null,
  async keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) {
        browserApp._wakeLock = await navigator.wakeLock.request('screen');
      } else if (!on && browserApp._wakeLock) {
        await browserApp._wakeLock.release();
        browserApp._wakeLock = null;
      }
    } catch (err) { console.warn('[app] wakeLock:', err); }
    return Boolean(browserApp._wakeLock);
  },
};
