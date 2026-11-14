import { prefersReducedMotion } from './reducedMotion.ts';
// Animate actual block height so neighbouring rows participate in the layout.
const animations = new WeakMap<Element, { animation: Animation; timer: ReturnType<typeof setTimeout> }>();
export function cancelFold(el: Element) {
  const active = animations.get(el);
  if (active) {
    clearTimeout(active.timer);
    active.animation.onfinish = active.animation.oncancel = null;
    active.animation.cancel();
  }
  animations.delete(el);
  (el as HTMLElement).style.overflow = '';
}
function animate(el: Element, closing: boolean, done: () => void) {
  const node = el as HTMLElement;
  const current = node.getBoundingClientRect().height;
  const interrupted = animations.has(el);
  cancelFold(el);
  if (prefersReducedMotion()) {
    done();
    return;
  }
  const full = node.getBoundingClientRect().height;
  node.style.overflow = 'hidden';
  const animation = node.animate(
    [
      {
        height: `${closing || interrupted ? current : 0}px`,
        opacity: closing ? 1 : 0,
        paddingTop: closing ? getComputedStyle(node).paddingTop : '0px',
        paddingBottom: closing ? getComputedStyle(node).paddingBottom : '0px',
      },
      {
        height: `${closing ? 0 : full}px`,
        opacity: closing ? 0 : 1,
        paddingTop: closing ? '0px' : getComputedStyle(node).paddingTop,
        paddingBottom: closing ? '0px' : getComputedStyle(node).paddingBottom,
      },
    ],
    { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' },
  );
  const finish = () => {
    if (animations.get(el)?.animation !== animation) return;
    cancelFold(el);
    done();
  };
  animations.set(el, { animation, timer: setTimeout(finish, 320) });
  animation.onfinish = animation.oncancel = finish;
}
export function unfold(el: Element, done: () => void) {
  animate(el, false, done);
}
export function fold(el: Element, done: () => void) {
  animate(el, true, done);
}
