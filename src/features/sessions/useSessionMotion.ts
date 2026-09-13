import { nextTick, onBeforeUnmount } from 'vue';
import { useRouter, type RouteLocationNormalized } from 'vue-router';

export function useSessionMotion() {
  const router = useRouter();
  const animations = new Set<Animation>();
  let revision = 0;
  let pending: { path: string; revision: number; chatOnly: boolean } | undefined;
  const page = (route: RouteLocationNormalized) => route.meta.section === 'sessions'
    ? String(route.params.id || route.name) : null;
  function stop() { for (const animation of animations) animation.cancel(); animations.clear(); }
  function elements(chatOnly: boolean) {
    // Keep the sidebar, composer and header actions stationary between chats.
    const selector = chatOnly ? '.chatlog-wrap, .chat-title'
      : matchMedia('(max-width: 899px)').matches ? '.sessions-split' : '.content-pane';
    return [...document.querySelectorAll<HTMLElement>(selector)];
  }
  function fade(nodes: HTMLElement[], opacity: number, duration: number) {
    return Promise.all(nodes.map(node => {
      const from = opacity === 1 ? 0 : Number(getComputedStyle(node).opacity);
      const animation = node.animate([{ opacity: from }, { opacity }], { duration, easing: 'ease-out', fill: 'forwards' });
      animations.add(animation);
      return new Promise<void>(resolve => {
        animation.oncancel = () => { animations.delete(animation); resolve(); };
        animation.onfinish = () => {
          if (opacity === 1) { animations.delete(animation); animation.cancel(); }
          resolve();
        };
      });
    }));
  }
  const removeBefore = router.beforeResolve(async (to, from) => {
    const current = ++revision;
    pending = undefined;
    stop();
    if (!page(to) || !page(from) || page(to) === page(from) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const chatOnly = !!to.params.id && !!from.params.id;
    pending = { path: to.fullPath, revision: current, chatOnly };
    await fade(elements(chatOnly), 0, 50);
    if (current !== revision) return false;
  });
  const removeAfter = router.afterEach(async (to, _from, failure) => {
    const change = pending;
    if (!change || change.path !== to.fullPath) return;
    if (failure) { pending = undefined; stop(); return; }
    await nextTick();
    if (change.revision !== revision) return;
    pending = undefined;
    stop();
    void fade(elements(change.chatOnly), 1, 90);
  });
  onBeforeUnmount(() => { revision++; removeBefore(); removeAfter(); stop(); });
}
