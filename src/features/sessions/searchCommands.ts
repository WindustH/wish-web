import type { Router } from 'vue-router';
import { watch } from 'vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import { requestSearchFocus, searchFocus } from './searchFocus.ts';
export function sessionSearchCommands(router: Router) {
  function request(scope: 'list' | 'chat', session?: string) {
    const cancel = requestSearchFocus({ scope, session });
    const intent = searchFocus.value;
    const remove = router.afterEach((to, _, failure) => {
      if (failure || (scope === 'chat' ? String(to.params.id) !== session : to.meta.section !== 'sessions')) cancel();
      if (searchFocus.value !== intent) remove();
    });
    // A consumed/expired request has no reason to retain a router hook.
    const stop = watch(
      searchFocus,
      (value) => {
        if (value !== intent) {
          remove();
          stop();
        }
      },
      { flush: 'sync' },
    );
    return cancel;
  }
  return {
    async focusSessionSearch() {
      request('list');
      if (router.currentRoute.value.meta.section !== 'sessions' || matchMedia('(max-width: 899px)').matches)
        await router.push('/sessions');
      prefs.setSessionListCollapsed(false);
    },
    canSearchChat: () => Boolean(router.currentRoute.value.params.id),
    async focusChatSearch() {
      request('chat', String(router.currentRoute.value.params.id));
      await router.push({ name: 'chat-search', params: { id: router.currentRoute.value.params.id } });
    },
  };
}
