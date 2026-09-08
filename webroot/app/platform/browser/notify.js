// Browser notification adapter (Notification API). Permission DENIAL and API
// FAILURE are different things (round-5): a denied permission resolves
// 'denied'; a throwing Notification API REJECTS so callers can surface the
// failure instead of silently misreporting it.
export const browserNotify = {
  get isSupported() { return typeof Notification !== 'undefined'; },
  permission() {
    if (!this.isSupported) return 'unsupported';
    return Notification.permission;   // 'granted' | 'denied' | 'default'
  },
  async request() {
    if (!this.isSupported) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();   // may reject → propagate
  },
  show({ title, body, tag, silent = true }) {
    if (!this.isSupported) return false;
    if (Notification.permission !== 'granted') return false;
    new Notification(title, { body, tag, silent });  // may throw → propagate
    return true;
  },
};
