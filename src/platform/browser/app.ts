// Browser app-shell adapter: visibility, PWA install prompt, and wake lock.
// Native shells override with their own adapter.
// Chromium-only event; not in the DOM lib.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let wakeLock: WakeLockSentinel | null = null;
let wakeRequest = 0;

export const browserApp = {
  // Background notifications must only fire while the page is hidden —
  // the visible UI is the primary channel (round-4 #2).
  isHidden(): boolean {
    return typeof document !== 'undefined' &&
      (document.visibilityState === 'hidden' || document.hidden === true);
  },
  captureInstallPrompt(event: Event): void {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
  },
  async promptInstall(): Promise<boolean> {
    const e = deferredPrompt;
    if (!e) return false;
    e.prompt();
    const { outcome } = await e.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  },
  async keepAwake(on: boolean): Promise<boolean> {
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
