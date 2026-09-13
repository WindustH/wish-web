import { nextTick, onBeforeUnmount } from 'vue';
import { useRouter, type RouteLocationNormalized } from 'vue-router';
import { sessions } from '../../core/state/sessionsSlice.js';

// Independent visual sheets let an interrupted page retreat while its
// replacement enters. Only one real conversation (and its live state) exists.
export function useSessionMotion() {
  const router = useRouter();
  const mobile = matchMedia('(max-width: 899px)');
  const hostElement = () => document.querySelector<HTMLElement>(mobile.matches ? '.sessions-split' : '.content-pane');
  const layers = new Set<HTMLElement>();
  const moving = new Map<HTMLElement, { animation: Animation; retreating: boolean }>();
  let base: HTMLElement | undefined;
  let baseId: string | null = null;
  let pending: { path: string; above: boolean; interrupted: boolean; outgoing?: HTMLElement; reused: boolean; target: string } | undefined;
  let order: string[] = [];
  const page = (route: RouteLocationNormalized) => route.meta.section !== 'sessions' || (!mobile.matches && route.name === 'all-sessions')
    ? null : route.name === 'all-sessions' ? 'all' : String(route.params.id || 'new');
  function clear() {
    for (const { animation } of moving.values()) animation.cancel();
    moving.clear();
    for (const layer of layers) layer.remove();
    layers.clear(); base = undefined; baseId = null; order = [];
  }
  function settle() { if (!moving.size && !pending) clear(); }
  function snapshot(host: HTMLElement, id: string) {
    const layer = document.createElement('div');
    layer.className = 'session-paper-layer';
    layer.inert = true;
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.paperId = id;
    if (!order.includes(id)) order.push(id);
    // Stack order is fixed throughout overlapping animations.
    layer.style.zIndex = String(10000 - order.indexOf(id));
    for (const child of [...host.children]) {
      if (layers.has(child as HTMLElement)) continue;
      const copy = child.cloneNode(true) as HTMLElement;
      layer.append(copy);
      const originals = [child, ...child.querySelectorAll('*')];
      const copies = [copy, ...copy.querySelectorAll('*')];
      originals.forEach((source, index) => {
        const target = copies[index]!;
        target.removeAttribute('id');
        if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) target.value = source.value;
        if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) target.value = source.value;
        if (source instanceof HTMLCanvasElement && target instanceof HTMLCanvasElement) target.getContext('2d')?.drawImage(source, 0, 0);
      });
    }
    host.append(layer);
    // Scroll offsets aren't copied by cloneNode; restore after layout exists.
    const originals = [...host.children].filter(child => !layers.has(child as HTMLElement) && child !== layer).flatMap(child => [child, ...child.querySelectorAll('*')]);
    const copies = [...layer.children].flatMap(child => [child, ...child.querySelectorAll('*')]);
    originals.forEach((source, index) => { const target = copies[index]!; target.scrollTop = source.scrollTop; target.scrollLeft = source.scrollLeft; });
    layers.add(layer);
    return layer;
  }
  function slide(layer: HTMLElement, entering: boolean) {
    layer.dataset.paperMotion = entering ? 'enter' : 'exit';
    const edge = mobile.matches ? -100 : 100;
    const animation = layer.animate([
      { transform: `translateX(${entering ? edge : 0}%)` },
      { transform: `translateX(${entering ? 0 : edge}%)` },
    ], { duration: 140, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
    moving.set(layer, { animation, retreating: false });
    animation.onfinish = () => { moving.delete(layer); layers.delete(layer); layer.remove(); settle(); };
  }
  const removeBefore = router.beforeResolve((to, from) => {
    const next = page(to), previous = page(from);
    if (!next || !previous) { pending = undefined; clear(); return; }
    if (next === previous) return;
    const host = hostElement();
    if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) { pending = undefined; clear(); return; }
    const interrupted = moving.size > 0;
    let reused = false;
    for (const [layer, motion] of moving) {
      if (layer.dataset.paperId === next && motion.retreating) {
        motion.retreating = false; motion.animation.reverse(); reused = true;
      } else if (!motion.retreating) { motion.retreating = true; motion.animation.reverse(); }
    }
    if (!order.length) order = ['new', ...(mobile.matches ? ['all'] : []), ...sessions.items.value.map(row => row.id)];
    const nextIndex = order.indexOf(next), previousIndex = order.indexOf(previous);
    const above = next === 'new' || (previous !== 'new' && (nextIndex >= 0 && previousIndex >= 0 ? nextIndex < previousIndex : next > previous));
    if (!base) { base = snapshot(host, previous); baseId = previous; }
    pending = { path: to.fullPath, target: next, above, interrupted, reused, outgoing: !above && !interrupted ? base : undefined };
  });
  const removeAfter = router.afterEach(async (to, _from, failure) => {
    const change = pending;
    if (!change || change.path !== to.fullPath) return;
    if (failure) { pending = undefined; settle(); return; }
    await nextTick();
    if (pending !== change) return;
    pending = undefined;
    const host = hostElement();
    if (!host) { clear(); return; }
    if (change.outgoing) {
      // The destination is underneath; move the old sheet off to the right.
      const outgoing = change.outgoing;
      base = snapshot(host, change.target); baseId = change.target;
      slide(outgoing, false);
    } else if (!change.reused && (!change.interrupted || change.target !== baseId)) {
      slide(snapshot(host, change.target), true);
    }
    settle();
  });
  const resize = () => { pending = undefined; clear(); };
  mobile.addEventListener('change', resize);
  onBeforeUnmount(() => { mobile.removeEventListener('change', resize); removeBefore(); removeAfter(); pending = undefined; clear(); });
}
