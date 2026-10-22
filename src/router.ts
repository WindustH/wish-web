// Hash routing (works from any static host, no server rewrites).
import { createRouter, createWebHashHistory } from 'vue-router';
import SessionsView from './features/sessions/SessionsView.vue';
import StartChat from './features/sessions/StartChat.vue';
import { installSessionNavigation } from './features/shell/sessionNavigation.ts';
import { createBackLayers, setBackLayers } from './ui/backLayers.ts';

declare module 'vue-router' {
  interface RouteMeta {
    section?: 'sessions' | 'stats' | 'settings' | 'data';
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      // The list stays mounted on desktop while the right side routes
      // between (empty) and chat; chat stays mounted across its child tabs.
      path: '/',
      meta: { section: 'sessions' },
      component: SessionsView,
      children: [
        { path: '', redirect: '/sessions' },
        { path: 'sessions', name: 'sessions', component: StartChat },
        // On a phone the full list is a sheet over the home page, which stays beneath it.
        { path: 'sessions/all', name: 'all-sessions', component: StartChat },
        { path: 'new', name: 'new-chat', component: StartChat },
        {
          path: 'g/:id',
          name: 'group',
          component: () => import('./features/groups/GroupPane.vue'),
        },
        {
          path: 's/:id',
          component: () => import('./features/sessions/ChatPane.vue'),
          children: [
            { path: '', name: 'chat', component: { render: () => null } },
            { path: 'info', name: 'chat-info', component: () => import('./features/sessions/InfoPane.vue') },
            { path: 'search', name: 'chat-search', component: () => import('./features/sessions/SearchPane.vue') },
            { path: 'settings', name: 'chat-settings', component: () => import('./features/sessions/SessionSettingsPane.vue') },
          ],
        },
      ],
    },
    { path: '/stats', name: 'stats', meta: { section: 'stats' }, component: () => import('./features/stats/StatsView.vue') },
    { path: '/data', name: 'data', meta: { section: 'data' }, component: () => import('./features/data/DataView.vue') },
    // Root-owned settings screen (config editor round).
    { path: '/settings', name: 'settings', meta: { section: 'settings' }, component: () => import('./features/settings/SettingsView.vue') },
    { path: '/account', name: 'account', component: () => import('./features/account/AccountView.vue') },
    { path: '/selftest', name: 'selftest', component: () => import('./features/selftest/SelftestView.vue') },
    { path: '/:pathMatch(.*)*', redirect: { path: '/sessions', replace: true } },
  ],
});

const windows = createBackLayers(window, () => new URL(router.options.history.createHref(router.currentRoute.value.fullPath), window.location.href).href === window.location.href);
setBackLayers(windows);
const windowNavigations = new WeakMap<object, number>();
router.beforeEach(async (to, from) => {
  if (to.fullPath !== from.fullPath) windowNavigations.set(to, await windows.beforeNavigation());
});
router.afterEach((to, from, failure) => {
  const ticket = windowNavigations.get(to);
  // Crossing the desktop breakpoint turns a routed session panel into a local window and
  // normalizes its child URL. That window stays open through the normalization.
  const normalizedPanel = to.name === 'chat' && from.name !== 'chat' && !!to.params.id && to.params.id === from.params.id;
  if (ticket != null) windows.afterNavigation(!failure, ticket, normalizedPanel);
});
installSessionNavigation(router);
