import { nextTick, onScopeDispose, ref, watch, type Ref } from 'vue';
import type { Router } from 'vue-router';
import { backLayers } from '../../ui/backLayers.ts';
import { pageBackTarget } from './pageBackTarget.ts';
import { toast } from '../../ui/toast.ts';
import { tr } from '../../core/i18n/tr.ts';

// Taken before the application starts adding dialog and route entries.
const entryHistoryLength = window.history.length;

export function useMobileBackNavigation(router: Router, mobile: Ref<boolean>, backgroundPath: () => string) {
  const exitRequested = ref(false);
  let leaving = false;
  const navigation = backLayers();

  function back() {
    if (exitRequested.value) {
      exitRequested.value = false;
      return;
    }
    const route = router.currentRoute.value;
    const parent = pageBackTarget(route.path, route.query, backgroundPath());
    if (parent) void router.replace(parent);
    else exitRequested.value = true;
  }
  watch(mobile, (enabled) => navigation?.setPageBack(enabled && !leaving ? back : undefined), { immediate: true });
  const removeRouteListener = router.afterEach(() => {
    exitRequested.value = false;
    restoreBoundary();
  });
  onScopeDispose(() => {
    removeRouteListener();
    navigation?.setPageBack(undefined);
  });

  async function confirmExit() {
    leaving = true;
    exitRequested.value = false;
    // The confirmation host unmounts before removing the history boundary, releasing its
    // focus and pointer locks even when the browser cannot close an installed web app.
    await nextTick();
    const removedBoundary = await navigation?.releasePageBoundary();
    // Popping the sentinel leaves it in forward history; history.length still includes it.
    const internalEntries = window.history.length - entryHistoryLength - Number(!!removedBoundary);
    if (entryHistoryLength > 1) {
      window.history.go(-(internalEntries + 1));
    } else {
      // Browsers do not expose a portable "close PWA" API. Hand the next system Back to
      // the browser only after explicit consent; returning to the app restores protection.
      if (internalEntries > 0) {
        const homeUrl = window.location.href;
        const homeState = window.history.state;
        const finish = (event: PopStateEvent) => {
          event.stopImmediatePropagation();
          window.removeEventListener('popstate', finish, true);
          window.history.replaceState({ ...homeState, position: 0, back: null }, '', homeUrl);
          toast(tr('再按一次系统返回键退出', 'Press the system Back button again to exit'));
        };
        window.addEventListener('popstate', finish, true);
        window.history.go(-internalEntries);
      } else toast(tr('再按一次系统返回键退出', 'Press the system Back button again to exit'));
    }
  }
  function restoreBoundary() {
    if (!leaving) return;
    leaving = false;
    if (mobile.value) navigation?.setPageBack(back);
  }
  window.addEventListener('pageshow', restoreBoundary);
  onScopeDispose(() => window.removeEventListener('pageshow', restoreBoundary));
  return { exitRequested, confirmExit };
}
