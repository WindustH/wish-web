// Single polite live region for screen-reader announcements (decisions 24):
// completion is announced ONCE per turn; no chatter.
let region = null;

export function announce(text) {
  if (!text) return;
  if (typeof document === 'undefined') return;   // core DOM-free guard
  if (!region) {
    region = document.createElement('div');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('role', 'status');
    region.style.cssText = 'position:fixed;left:-9999px;top:0;height:1px;overflow:hidden;';
    document.body.appendChild(region);
  }
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = text; });
}
