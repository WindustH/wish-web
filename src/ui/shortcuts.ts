// Global keyboard shortcuts (decisions 24):
//   Ctrl/Cmd+K        → sessions search
//   Ctrl/Cmd+,        → settings
//   Ctrl/Cmd+Shift+O  → new session
// IME-safe by construction: these combos never collide with composition keys.
import { router } from '../router.js';

export function installShortcuts({ openNewSession }: { openNewSession: () => void }) {
  const onKey = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'k') {
      e.preventDefault();
      router.push('/sessions');
      requestAnimationFrame(() => {
        (document.querySelector('.sl-head input[type="search"]') as HTMLInputElement | null)?.focus();
      });
    } else if (key === ',') {
      e.preventDefault();
      router.push('/settings');
    } else if (key === 'o' && e.shiftKey) {
      e.preventDefault();
      openNewSession();
    }
  };
  document.addEventListener('keydown', onKey);
}
