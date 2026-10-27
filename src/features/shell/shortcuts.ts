import { nextTick } from 'vue';
import { router } from '../../router.ts';
import { prefs } from '../../core/state/prefsSlice.ts';

export function installShortcuts({ openNewSession }: { openNewSession: () => void }) {
  const onKey = async (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || !(e.ctrlKey || e.metaKey)) return;
    // Only the event's own ancestry matters; unrelated open/hidden surfaces do not.
    if (e.composedPath().some((node) => node instanceof HTMLElement && node.hasAttribute('data-keyboard-boundary')))
      return;
    const key = e.key.toLowerCase();
    if (key === 'k') {
      e.preventDefault();
      // Desktop already has the list: keep the current conversation in view.
      if (!document.querySelector('.sl-head input')) await router.push('/sessions');
      prefs.setSessionListCollapsed(false);
      await nextTick();
      const search = document.querySelector<HTMLInputElement>('.sl-head input[type="search"]');
      search?.focus();
      search?.select();
    } else if (key === 'f' && e.shiftKey && router.currentRoute.value.params.id) {
      e.preventDefault();
      await router.push({ name: 'chat-search', params: { id: router.currentRoute.value.params.id } });
      await nextTick();
      document.querySelector<HTMLInputElement>('.search-row input')?.focus();
    } else if (key === ',') {
      e.preventDefault();
      await router.push('/settings');
    } else if (key === 'o' && e.shiftKey) {
      e.preventDefault();
      openNewSession();
    }
  };
  document.addEventListener('keydown', onKey);
}
