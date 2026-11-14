import type { Router } from 'vue-router';
import { prefs } from '../../core/state/prefsSlice.ts';
import { searchFocus } from './searchFocus.ts';
export function sessionSearchCommands(router: Router) {
  return {
    async focusSessionSearch() {
      searchFocus.value = { scope: 'list' };
      if (router.currentRoute.value.meta.section !== 'sessions' || matchMedia('(max-width: 899px)').matches)
        await router.push('/sessions');
      prefs.setSessionListCollapsed(false);
    },
    canSearchChat: () => Boolean(router.currentRoute.value.params.id),
    async focusChatSearch() {
      searchFocus.value = { scope: 'chat', session: String(router.currentRoute.value.params.id) };
      await router.push({ name: 'chat-search', params: { id: router.currentRoute.value.params.id } });
    },
  };
}
