import type { Router } from 'vue-router';

/** Reuse the mounted controls so shortcuts retain each sidebar's view and persistence. */
export function sessionSidebarCommands(router: Router) {
  return {
    sidebarToggle(side: 'left' | 'right') {
      if (router.currentRoute.value.meta.section !== 'sessions') return null;
      const selector = side === 'left' ? '.session-list-toggle' : '[data-sidebar-toggle]';
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (!button || button.disabled || !button.getClientRects().length || button.closest('[inert]')) return null;
      return () => button.click();
    },
  };
}
