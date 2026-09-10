import { nextTick } from 'vue';
import { router } from '../router.js';
import { prefs } from '../core/state/prefsSlice.js';

export function installShortcuts({ openNewSession }: { openNewSession: () => void }) {
  const onKey = async (e: KeyboardEvent) => {
    if (e.isComposing || !(e.ctrlKey || e.metaKey) || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    const key = e.key.toLowerCase();
    if (key === 'k') {
      e.preventDefault();
      // Desktop already has the list: keep the current conversation in view.
      if (!document.querySelector('.sl-head input')) await router.push('/sessions');
      prefs.setSessionListCollapsed(false);
      await nextTick();
      const search = document.querySelector<HTMLInputElement>('.sl-head input[type="search"]');
      search?.focus(); search?.select();
    } else if (key === 'f' && e.shiftKey && router.currentRoute.value.params.id) {
      e.preventDefault();
      await router.push({ name: 'chat-search', params: { id: router.currentRoute.value.params.id } });
      await nextTick();
      document.querySelector<HTMLInputElement>('.search-row input')?.focus();
    } else if (key === ',') {
      e.preventDefault(); await router.push('/settings');
    } else if (key === 'o' && e.shiftKey) {
      e.preventDefault(); openNewSession();
    }
  };
  document.addEventListener('keydown', onKey);
}
