import { onBeforeUnmount, watch, type Ref } from 'vue';
import { useRoute, useRouter, type Router } from 'vue-router';
import { animate, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion-v';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import { noteSwallowedClick } from '../../ui/scrollStalls.ts';
import { clearRecentsTransition, paintRecentsTransition } from './recentsTransition.ts';

// On a phone the full session list is a sheet over the home page. Its two resting places are the
// two routes - closed on /sessions, open on /sessions/all - and between them it follows a finger or
// a spring (Motion's, which carries the finger's speed on and can be caught mid-way). The home
// view crossfades to the folder-aware full list, which rises a little as a whole. These lists do
// not share an ordering, so no individual rows are matched or moved between them. A swipe up on the
// recent rows opens it, a pull down at the top of the list closes it; a touch while it moves takes
// hold of it where it is. A pull down on the recent rows only stretches them. Taps, links and the
// back button move it along the same path. Motion stops at the end it heads for, never past it.
// A touch that only takes hold, without moving, is still a tap: the sheet settles and the tap acts.
const FLING = 350;        // px/s of release that decides the way on its own
const SLOP = 6;           // px a finger moves before it drags rather than taps
const MAX_STRETCH = 96;   // px the recent rows stretch at most
const SPRING = { type: 'spring', bounce: 0, visualDuration: .24 } as const;

const restOf = (name: unknown) => name === 'all-sessions' ? 1 : name === 'sessions' ? 0 : undefined;

/** Back to the home page: back through history when that is where the list was opened from. */
export function goHome(router: Router) {
  if (window.history.state?.back === '/sessions') router.back();
  else void router.push('/sessions');
}

// How far a pull of `distance` px stretches: less and less, never past MAX_STRETCH.
const stretchOf = (distance: number) => MAX_STRETCH * (1 - 1 / (1 + Math.max(0, distance) / (MAX_STRETCH * 2)));
const pullOf = (offset: number) => MAX_STRETCH * 2 * (1 / (1 - Math.min(offset, MAX_STRETCH - 1) / MAX_STRETCH) - 1);

// Springs `value` to `to` and stops it there the moment it gets there, rather than letting it
// swing past and back. Stopped before then, it lets go of the value entirely: a spring stopped
// mid-way must not later snap the value to where it was heading.
function settleAt(value: MotionValue<number>, to: number, done: () => void): { stop: () => void } {
  let finished = false;
  let controls: AnimationPlaybackControls | undefined;
  const finish = () => {
    if (finished) return;
    finished = true;
    unwatch();
    controls?.stop();
    value.jump(to);
    done();
  };
  const from = value.get();
  const unwatch = value.on('change', current => { if ((current - to) * (from - to) <= 0) finish(); });
  controls = animate(value, to, { ...SPRING, velocity: value.getVelocity(), onComplete: finish });
  return { stop: () => { finished = true; unwatch(); controls?.stop(); } };
}

export function useRecentsSheet(split: Ref<HTMLElement | null>) {
  const route = useRoute();
  const router = useRouter();
  const phone = useIsMobile();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const progress = motionValue(restOf(route.name) ?? 0);  // 0 closed, 1 open
  const stretch = motionValue(0);
  let settling: { stop: () => void } | undefined;
  let target: 0 | 1 = progress.get() ? 1 : 0;
  let shift = 120;     // px of finger travel between closed and open
  let quietUntil = 0;  // a click before this time (performance.now) ends a drag, not opens anything
  let stretching: { stop: () => void } | undefined;
  type Drag = { kind: 'open' | 'close' | 'hold'; mode?: 'sheet' | 'stretch'; x: number; y: number; from: number };
  let drag: Drag | undefined;

  const sheet = () => split.value?.querySelector<HTMLElement>(':scope > #session-list') ?? null;
  const home = () => split.value?.querySelector<HTMLElement>(':scope > .content-pane') ?? null;
  const recents = () => home()?.querySelector<HTMLElement>('.recent-sessions') ?? null;
  const moving = () => !!settling || drag?.mode === 'sheet' || (progress.get() > 0 && progress.get() < 1);

  // Gesture distance depends on the viewport, never on which rows a folder happens to show.
  function measure() {
    shift = Math.max(120, Math.min(320, (split.value?.clientHeight ?? 0) * .35));
  }

  // The two whole views crossfade; the full list also makes a small upward move.
  function paint() {
    if (!phone.value || restOf(route.name) === undefined) return;
    const pane = sheet(), page = home();
    if (!pane || !page) return;
    paintRecentsTransition(pane, page, progress.get(), moving());
  }
  progress.on('change', paint);
  stretch.on('change', offset => {
    const node = recents();
    if (node) node.style.translate = offset > .1 ? `0 ${offset}px` : '';
  });

  function clear() {
    settling?.stop();
    settling = undefined;
    stretching?.stop();
    stretching = undefined;
    stretch.jump(0);
    drag = undefined;
    clearRecentsTransition(sheet(), home());
  }

  // Once at rest, the route follows where the sheet came to rest.
  function arrive() {
    settling = undefined;
    paint();
    const rest = restOf(route.name);
    if (progress.get() === 1 && rest !== 1) void router.push('/sessions/all');
    else if (progress.get() === 0 && rest !== 0) goHome(router);
  }

  function settle(to: 0 | 1) {
    target = to;
    settling?.stop();
    if (reduced.matches || progress.get() === to) { settling = undefined; progress.jump(to); arrive(); return; }
    settling = settleAt(progress, to, arrive);
    paint();
  }

  function onTouchStart(event: TouchEvent) {
    drag = undefined;
    // Whatever the last touch was, this one is new; only its own drag may keep its click.
    quietUntil = 0;
    const touch = event.touches[0];
    if (!phone.value || event.touches.length !== 1 || !touch) return;
    const at = event.target as Element;
    const name = route.name;
    let kind: Drag['kind'] | undefined;
    if (moving()) kind = 'hold';
    else if (name === 'sessions' && !progress.get() && at.closest('.recent-sessions')) kind = 'open';
    else if (name === 'all-sessions' && progress.get() === 1 && at.closest('#session-list')) {
      const list = sheet()?.querySelector<HTMLElement>('.sl-scroll');
      if (!at.closest('.sl-scroll') || !list || list.scrollTop <= 0) kind = 'close';
    }
    if (!kind) return;
    // Taking hold stops it where it is.
    if (kind === 'hold') { settling?.stop(); settling = undefined; }
    stretching?.stop();
    stretching = undefined;
    drag = { kind, x: touch.clientX, y: touch.clientY, from: 0 };
  }

  function onTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (!drag || !touch) return;
    if (!drag.mode) {
      const dx = touch.clientX - drag.x, dy = touch.clientY - drag.y;
      // A finger that only trembles is still tapping: its click stays its own.
      if (Math.hypot(dx, dy) < SLOP) return;
      if (drag.kind === 'hold') drag.mode = 'sheet';
      else if (Math.abs(dx) > Math.abs(dy)) { drag = undefined; return; }
      else if (drag.kind === 'close') {
        if (dy < 0) { drag = undefined; return; }  // scrolling the list
        measure();
        drag.mode = 'sheet';
      } else {
        // On the home page: up opens, down stretches, unless the page itself scrolls that way first.
        const page = home()?.querySelector<HTMLElement>('.start-chat');
        if (page && (dy < 0 ? page.scrollTop + page.clientHeight < page.scrollHeight - 1 : page.scrollTop > 0)) { drag = undefined; return; }
        if (dy < 0) {
          const list = sheet()?.querySelector<HTMLElement>('.sl-scroll');
          if (list) list.scrollTop = 0;
          measure();
          drag.mode = 'sheet';
        } else drag.mode = 'stretch';
      }
      // Moves count from here, so the content does not jump by what it took to decide.
      drag.y = touch.clientY;
      drag.from = drag.mode === 'sheet' ? progress.get() : pullOf(stretch.get());
    }
    event.preventDefault();
    event.stopPropagation();
    const moved = touch.clientY - drag.y;
    if (drag.mode === 'sheet') progress.set(Math.min(1, Math.max(0, drag.from - moved / shift)));
    else stretch.set(stretchOf(drag.from + moved));
  }

  function onTouchEnd(event: TouchEvent) {
    const ended = drag;
    drag = undefined;
    if (!ended) return;
    if (ended.mode) quietUntil = performance.now() + 400;
    if (ended.mode === 'stretch') {
      stretching = settleAt(stretch, 0, () => { stretching = undefined; });
      return;
    }
    if (ended.mode !== 'sheet' && ended.kind !== 'hold') return;
    const value = progress.get();
    const speed = -progress.getVelocity() * shift;  // px/s, down
    let to: 0 | 1;
    if (event.type === 'touchcancel') to = value >= .5 ? 1 : 0;
    else if (Math.abs(speed) > FLING) to = speed < 0 ? 1 : 0;
    // A third of the way either way commits.
    else if (ended.kind === 'open') to = value > 1 / 3 ? 1 : 0;
    else if (ended.kind === 'close') to = value < 2 / 3 ? 0 : 1;
    else to = value >= .5 ? 1 : 0;
    settle(to);
  }

  function onClick(event: MouseEvent) {
    if (performance.now() >= quietUntil) return;
    quietUntil = 0;
    event.preventDefault();
    event.stopPropagation();
    noteSwallowedClick('recents sheet: the touch dragged it');
  }

  watch(split, (element, _, cleanup) => {
    if (!element) return;
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    element.addEventListener('click', onClick, true);
    cleanup(() => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove, { capture: true });
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('click', onClick, true);
    });
  }, { immediate: true });

  // Routes move the sheet too: along its path between the two, straight to its place otherwise.
  watch([() => route.name, phone, split], ([name, mobile], [previous]) => {
    const rest = restOf(name);
    if (!mobile || rest === undefined) { clear(); progress.jump(rest ?? 0); target = rest ?? 0; return; }
    if (drag?.mode === 'sheet' || (settling && target === rest)) return;
    if (!settling && progress.get() === rest) { paint(); return; }
    if (restOf(previous) === undefined || !sheet()) { settling?.stop(); settling = undefined; progress.jump(rest); paint(); return; }
    if (!moving()) {
      if (!progress.get()) {
        const list = sheet()?.querySelector<HTMLElement>('.sl-scroll');
        if (list) list.scrollTop = 0;
      }
      measure();
    }
    settle(rest);
  }, { immediate: true, flush: 'post' });

  onBeforeUnmount(() => { clear(); progress.destroy(); stretch.destroy(); });
}
