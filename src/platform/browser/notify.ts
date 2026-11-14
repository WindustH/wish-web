// Browser notification adapter (Notification API). Permission DENIAL and API
// FAILURE are different things (round-5): a denied permission resolves
// 'denied'; a throwing Notification API REJECTS so callers can surface the
// failure instead of silently misreporting it.
import type { NotifyOptions, NotifyPermission } from '../index.ts';

export const browserNotify = {
  get isSupported(): boolean {
    return typeof Notification !== 'undefined';
  },
  permission(): NotifyPermission {
    if (!this.isSupported) return 'unsupported';
    return Notification.permission; // 'granted' | 'denied' | 'default'
  },
  async request(): Promise<NotifyPermission> {
    if (!this.isSupported) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission(); // may reject → propagate
  },
  async show({ title, body, tag, silent = true }: NotifyOptions): Promise<boolean> {
    if (!this.isSupported) return false;
    if (Notification.permission !== 'granted') return false;
    // Android requires persistent notifications. getRegistration() also works
    // without a controller and, unlike ready, does not hang on pages without SW.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.active) await registration.showNotification(title, { body, tag, silent });
    else new Notification(title, { body, tag, silent }); // may throw → propagate
    return true;
  },
};
