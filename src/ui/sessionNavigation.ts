import { readonly, shallowRef } from 'vue';
import type { Router } from 'vue-router';

// Navigation remembers the last successful location, including an explicit
// return to the mobile list. The URL remains the current view's authority.
const lastSessionLocation = shallowRef('/sessions');
export const sessionLocation = readonly(lastSessionLocation);
const lastSessionParent = shallowRef('/sessions');
export const sessionParent = readonly(lastSessionParent);
let parentSessionId: string | undefined;

export function installSessionNavigation(router: Router) {
  router.afterEach((to, from, failure) => {
    if (failure) return;
    if (to.meta.section === 'sessions') lastSessionLocation.value = to.fullPath;
    if (!to.params.id) return;
    const saved = router.options.history.state.sessionParent;
    const id = String(to.params.id);
    const parent = saved === '/sessions' || saved === '/sessions/all' ? saved
      : from.name === 'all-sessions' ? '/sessions/all'
      : from.name === 'sessions' || from.name === 'new-chat' ? '/sessions'
      : from.params.id || id === parentSessionId ? lastSessionParent.value : '/sessions';
    lastSessionParent.value = parent;
    parentSessionId = id;
    // Keep the source with this history entry, including reload and browser Back.
    router.options.history.replace(to.fullPath, { sessionParent: parent });
  });
}
