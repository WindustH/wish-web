import { nextTick } from 'vue';
import type { Router } from 'vue-router';
import { prefs } from '../../core/state/prefsSlice.ts';
export function sessionSearchCommands(router: Router) {
  return {
    async focusSessionSearch() {
      if (!document.querySelector('.sl-head input')) await router.push('/sessions');
      prefs.setSessionListCollapsed(false);
      await nextTick();
      const input = document.querySelector<HTMLInputElement>('.sl-head input[type="search"]');
      input?.focus();
      input?.select();
    },
    canSearchChat: () => Boolean(router.currentRoute.value.params.id),
    async focusChatSearch() {
      await router.push({ name: 'chat-search', params: { id: router.currentRoute.value.params.id } });
      await nextTick();
      document.querySelector<HTMLInputElement>('.search-row input')?.focus();
    },
  };
}
