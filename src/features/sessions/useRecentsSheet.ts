import { onBeforeUnmount, watch, type Ref } from 'vue';
import { useRoute, useRouter, type Router } from 'vue-router';
import { animate, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion-v';
import { useIsMobile } from '../../ui/composables/useMedia.ts';

// On a phone the full session list is a sheet over the home page. Its two resting places are the
// two routes - closed on /sessions, open on /sessions/all - and between them it follows a finger or
// a spring (Motion's, which carries the finger's speed on and can be caught mid-way). Closed, its
// rows lie exactly over the home page's recent rows; opening, it slides up from there, its heading
// and search fading in, and the rows the home page did not show fading in around them. A swipe up on the
// recent rows opens it, a pull down at the top of the list closes it; a touch while it moves takes
// hold of it where it is. A pull down on the recent rows only stretches them. Taps, links and the
// back button move it along the same path. Motion stops at the end it heads for, never past it.
const FLING = 350;        // px/s of release that decides the way on its own
const MAX_STRETCH = 96;   // px the recent rows stretch at most
const SPRING = { type: 'spring', bounce: 0, visualDuration: .32 } as const;

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
// swing past and back.
function settleAt(value: MotionValue<number>, to: number, done: () => void): AnimationPlaybackControls {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    stop();
    controls.stop();
    value.jump(to);
    done();
  };
  const from = value.get();
  const stop = value.on('change', current => { if ((current - to) * (from - to) <= 0) finish(); });
  const controls = animate(value, to, { ...SPRING, velocity: value.getVelocity(), onComplete: finish });
  return controls;
}

export function useRecentsSheet(split: Ref<HTMLElement | null>) {
  const route = useRoute();
  const router = useRouter();
  const phone = useIsMobile();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const progress = motionValue(restOf(route.name) ?? 0);  // 0 closed, 1 open
  const stretch = motionValue(0);
  let settling: AnimationPlaybackControls | undefined;
  let target: 0 | 1 = progress.get() ? 1 : 0;
  let shift = 0;       // px the sheet travels between closed and open
  let headers: HTMLElement[] = [];
  let extras: HTMLElement[] = [];  // rows the home page does not show
  let resting: 0 | 1 | undefined;
  let quietUntil = 0;  // clicks before this time end a drag, not open anything
  type Drag = { kind: 'open' | 'close' | 'hold'; mode?: 'sheet' | 'stretch'; x: number; y: number; from: number };
  let drag: Drag | undefined;

  const sheet = () => split.value?.querySelector<HTMLElement>(':scope > #session-list') ?? null;
  const home = () => split.value?.querySelector<HTMLElement>(':scope > .content-pane') ?? null;
  const recents = () => home()?.querySelector<HTMLElement>('.recent-sessions') ?? null;
  const moving = () => !!settling || drag?.mode === 'sheet' || (progress.get() > 0 && progress.get() < 1);

  // Where the sheet's rows must sit to lie over the recent rows; read once as a motion starts.
  function measure() {
    const pane = sheet(), area = split.value;
    if (!pane || !area) return;
    const recent = recents()?.querySelector<HTMLElement>('.sl-item[data-session-id]');
    const id = recent?.dataset.sessionId;
    const row = (id && pane.querySelector<HTMLElement>(`.sl-item[data-session-id="${CSS.escape(id)}"]`))
      || pane.querySelector<HTMLElement>('.sl-item[data-session-id]')
      || pane.querySelector<HTMLElement>('.sl-scroll');
    const rowOffset = row ? row.getBoundingClientRect().top - pane.getBoundingClientRect().top : 0;
    const homeOffset = recent ? recent.getBoundingClientRect().top - area.getBoundingClientRect().top - stretch.get() : area.clientHeight * .45;
    shift = Math.max(120, homeOffset - rowOffset);
    headers = [...pane.querySelectorAll<HTMLElement>(':scope > :is(.page-bar, .sl-masthead, .sl-filters)')];
    const shown = new Set([...recents()?.querySelectorAll<HTMLElement>('.sl-item[data-session-id]') ?? []].map(node => node.dataset.sessionId));
    for (const node of extras) node.classList.remove('sheet-extra');
    extras = [...pane.querySelectorAll<HTMLElement>('.sl-scroll [data-index]')]
      .filter(node => !shown.has(node.querySelector<HTMLElement>('.sl-item')?.dataset.sessionId));
    for (const node of extras) node.classList.add('sheet-extra');
  }

  // Only transform and opacity change from frame to frame; the rest only when it comes to rest or
  // starts moving.
  function paint() {
    const pane = sheet(), page = home();
    if (!pane || !page) return;
    const value = progress.get();
    const rest = moving() ? undefined : value >= 1 ? 1 : 0;
    if (rest !== resting || rest === undefined) {
      pane.style.visibility = rest === 0 ? 'hidden' : 'visible';
      pane.inert = rest === 0;
      pane.style.willChange = rest === undefined ? 'transform' : '';
      if (rest !== undefined) {
        pane.style.removeProperty('--sheet-reveal');
        for (const node of extras) node.classList.remove('sheet-extra');
        extras = [];
      }
      page.style.visibility = rest === 1 ? 'hidden' : 'visible';
      page.inert = rest === 1;
      resting = rest;
    }
    pane.style.transform = rest === undefined ? `translateY(${(1 - value) * shift}px)` : '';
    for (const node of headers) node.style.opacity = rest === undefined ? String(Math.min(1, value * 1.4)) : '';
    // The other rows come in once the sheet is on its way, and are all there a little before it lands.
    if (rest === undefined) pane.style.setProperty('--sheet-reveal', String(Math.min(1, Math.max(0, (value - .1) / .6))));
  }
  progress.on('change', paint);
  stretch.on('change', offset => {
    const node = recents();
    if (node) node.style.translate = offset > .1 ? `0 ${offset}px` : '';
  });

  function clear() {
    settling?.stop();
    settling = undefined;
    stretch.stop();
    stretch.jump(0);
    drag = undefined;
    resting = undefined;
    const pane = sheet(), page = home();
    for (const node of [pane, page]) {
      if (!node) continue;
      node.style.visibility = node.style.transform = node.style.willChange = '';
      node.inert = false;
    }
    for (const node of headers) node.style.opacity = '';
    pane?.style.removeProperty('--sheet-reveal');
    for (const node of extras) node.classList.remove('sheet-extra');
    extras = [];
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
    if (reduced.matches) { settling = undefined; progress.jump(to); arrive(); return; }
    settling = settleAt(progress, to, arrive);
    paint();
  }

  function onTouchStart(event: TouchEvent) {
    drag = undefined;
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
    stretch.stop();
    drag = { kind, x: touch.clientX, y: touch.clientY, from: 0 };
  }

  function onTouchMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (!drag || !touch) return;
    if (!drag.mode) {
      const dx = touch.clientX - drag.x, dy = touch.clientY - drag.y;
      if (!dx && !dy) return;
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
    if (ended.mode || ended.kind === 'hold') quietUntil = event.timeStamp + 400;
    if (ended.mode === 'stretch') {
      settleAt(stretch, 0, () => {});
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
    if (event.timeStamp < quietUntil) { event.preventDefault(); event.stopPropagation(); }
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
    if (!settling && progress.get() === rest) { resting = undefined; paint(); return; }
    if (restOf(previous) === undefined || !sheet()) { settling?.stop(); settling = undefined; progress.jump(rest); resting = undefined; paint(); return; }
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
