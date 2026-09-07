// Browser notification adapter (Notification API).
export const browserNotify = {
  get isSupported() { return typeof Notification !== 'undefined'; },
  permission() {
    return this.isSupported ? Notification.permission : 'unsupported';
  },
  async request() {
    if (!this.isSupported) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    try { return await Notification.requestPermission(); } catch { return 'denied'; }
  },
  show({ title, body, tag, silent = true }) {
    if (!this.isSupported || Notification.permission !== 'granted') return false;
    try { new Notification(title, { body, tag, silent }); return true; }
    catch { return false; }
  },
};
