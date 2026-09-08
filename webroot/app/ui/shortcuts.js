// Global keyboard shortcuts (decisions 24):
//   Ctrl/Cmd+K        → sessions search
//   Ctrl/Cmd+,        → settings
//   Ctrl/Cmd+Shift+O  → new session (avoids the browser's Ctrl/N/Ctrl+T)
// IME-safe by construction: these combos never collide with composition keys.
import { navigate } from './router.js';

export function installShortcuts({ openNewSession } = {}) {
  const onKey = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'k') {
      e.preventDefault();
      navigate('/sessions');
      // focus the search input once it exists
      requestAnimationFrame(() => {
        document.querySelector('.sl-head input[type="search"]')?.focus();
      });
    } else if (key === ',') {
      e.preventDefault();
      navigate('/settings');
    } else if (key === 'o' && e.shiftKey) {
      e.preventDefault();
      openNewSession?.();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
