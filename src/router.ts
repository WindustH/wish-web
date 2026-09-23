// Hash routing (works from any static host, no server rewrites).
import { createRouter, createWebHashHistory } from 'vue-router';
import SessionsView from './features/sessions/SessionsView.vue';
import StartChat from './features/sessions/StartChat.vue';
import { installSessionNavigation } from './ui/sessionNavigation';

declare module 'vue-router' {
  interface RouteMeta {
    section?: 'sessions' | 'stats' | 'settings';
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
        { path: 'sessions/all', name: 'all-sessions', component: { render: () => null } },
        { path: 'new', name: 'new-chat', component: StartChat },
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

installSessionNavigation(router);
