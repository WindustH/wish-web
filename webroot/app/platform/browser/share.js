// Browser share adapter (Web Share API where available).
export const browserShare = {
  get isSupported() { return typeof navigator !== 'undefined' && !!navigator.share; },
  async share(payload) {
    if (!this.isSupported) return false;
    try { await navigator.share(payload); return true; } catch { return false; }
  },
};
