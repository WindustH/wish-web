import { nextTick, onBeforeUnmount } from 'vue';
import { useRouter, type RouteLocationNormalized } from 'vue-router';

// Enter deeper pages from the right; reveal parents from the left.
// Animate the mounted page so cached scroll positions and forms stay intact.
export function useMobileNavigationMotion() {
  const router = useRouter();
  const animations = new Set<Animation>();
  let revision = 0;
  function depth(route: RouteLocationNormalized) {
    if (route.meta.section === 'settings') return route.query.section ? 4 : 3;
    if (route.params.id) return route.name === 'chat' ? 2 : 3;
    if (route.name === 'sessions' || route.name === 'new-chat') return 0;
    return 1;
  }
  const remove = router.afterEach(async (to, from, failure) => {
    const current = ++revision;
    for (const animation of animations) animation.cancel();
    animations.clear();
    if (failure || to.fullPath === from.fullPath || !matchMedia('(max-width: 899px)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    await nextTick();
    if (current !== revision) return;
    const distance = depth(to) === depth(from) ? 0 : depth(to) > depth(from) ? 24 : -24;
    const nodes = to.meta.section === 'settings'
      ? document.querySelectorAll<HTMLElement>(to.query.section ? '.settings-detail' : '.settings-sidebar')
      : document.querySelectorAll<HTMLElement>('.main-col > .route-page');
    for (const node of nodes) {
      if (!node.getClientRects().length) continue;
      const animation = node.animate([{ opacity: .4, transform: `translateX(${distance}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
      animations.add(animation);
      animation.onfinish = animation.oncancel = () => animations.delete(animation);
    }
  });
  onBeforeUnmount(() => { revision++; remove(); for (const animation of animations) animation.cancel(); });
}
