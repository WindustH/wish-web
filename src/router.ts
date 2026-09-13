// Hash routing (works from any static host, no server rewrites).
import { createRouter, createWebHashHistory } from 'vue-router';
import { readonly, shallowRef } from 'vue';

declare module 'vue-router' {
  interface RouteMeta {
    section?: 'sessions' | 'stats' | 'settings';
  }
}

// Navigation remembers the last successful location, including an explicit
// return to the mobile list. The URL remains the current view's authority.
const lastSessionLocation = shallowRef('/sessions');
export const sessionLocation = readonly(lastSessionLocation);
const lastSessionParent = shallowRef('/sessions');
export const sessionParent = readonly(lastSessionParent);
let parentSessionId: string | undefined;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      // The list stays mounted on desktop while the right side routes
      // between (empty) and chat; chat stays mounted across its child tabs.
      path: '/',
      meta: { section: 'sessions' },
      component: () => import('./features/sessions/SessionsView.vue'),
      children: [
        { path: '', redirect: '/sessions' },
        { path: 'sessions', name: 'sessions', component: () => import('./features/sessions/StartChat.vue') },
        { path: 'sessions/all', name: 'all-sessions', component: { render: () => null } },
        { path: 'new', name: 'new-chat', component: () => import('./features/sessions/StartChat.vue') },
        {
          path: 's/:id',
          component: () => import('./features/sessions/ChatPane.vue'),
          children: [
            { path: '', name: 'chat', component: { render: () => null } },
            { path: 'info', name: 'chat-info', component: () => import('./features/sessions/InfoPane.vue') },
            { path: 'search', name: 'chat-search', component: () => import('./features/sessions/SearchPane.vue') },
            { path: 'manage', name: 'chat-manage', component: () => import('./features/sessions/ManagePane.vue') },
          ],
        },
      ],
    },
    { path: '/stats', name: 'stats', meta: { section: 'stats' }, component: () => import('./features/stats/StatsView.vue') },
    // Root-owned settings screen (config editor round).
    { path: '/settings', name: 'settings', meta: { section: 'settings' }, component: () => import('./features/settings/SettingsView.vue') },
    { path: '/selftest', name: 'selftest', component: () => import('./features/selftest/SelftestView.vue') },
    { path: '/:pathMatch(.*)*', redirect: { path: '/sessions', replace: true } },
  ],
});

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
