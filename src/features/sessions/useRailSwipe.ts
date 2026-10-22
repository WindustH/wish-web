// The phone's rail gesture: a rightward drag slides the words aside - on a transform, never on
// the log's geometry, so no frame of it reflows the list - and letting go settles the lane open
// or shut with one animated padding change. A vertical drag is the browser's to scroll: the
// gesture yields the moment it sees one, and any surprise (a pointercancel, a second finger, the
// window losing focus) puts everything back exactly as it was, so the rail can never lock up.
//
// What it touches: pointer listeners on .chatlog-wrap (never the scroll container itself), the
// classes rail-gesture / rail-settling / rail-open on .chatlog, and two element-scoped custom
// properties - --rail-drag on .chatlog for the content's transform, --rail-peek on .chatlog-wrap
// for the rail's own slide. Nothing global; --rail-scroll stays the scroll handler's alone.
import { onScopeDispose, ref, watch, type Ref } from 'vue';

const LANE = 44;      // px of padding an open rail adds to the log
const LOCK = 10;      // px of travel before the gesture owns the drag
const BIAS = 1.5;     // horizontal must beat vertical by this much to lock
const FLICK = 0.3;    // px/ms that settles the lane on its own
const SETTLE = 200;   // ms the settle animation runs

export function useRailSwipe(options: { wrap: Ref<HTMLElement | null>; scroll: Ref<HTMLElement | null>; enabled: Ref<boolean> }) {
  /** Whether the lane stands open. Kept across session switches, a pane-level preference. */
  const open = ref(false);

  type Phase = 'idle' | 'pending' | 'locked';
  let phase: Phase = 'idle';
  let pointerId = -1;
  let pointers = 0;
  let startX = 0;
  let startY = 0;
  let fromOpen = false;
  let samples: { x: number; t: number }[] = [];
  let settling = 0;

  const wrap = () => options.wrap.value;
  const scroll = () => options.scroll.value;

  // The drag writes only what a compositor can honor: the content's transform (against whichever
  // padding it starts from) and the rail's own slide.
  function drag(reveal: number) {
    scroll()?.style.setProperty('--rail-drag', `${fromOpen ? reveal - LANE : reveal}px`);
    wrap()?.style.setProperty('--rail-peek', `${reveal}px`);
  }
  function classes(gesture: boolean, settle: boolean) {
    scroll()?.classList.toggle('rail-gesture', gesture);
    scroll()?.classList.toggle('rail-settling', settle);
  }
  // One layout change, once: the padding snaps to the settled lane while the drag's transform
  // unwinds beside it, both under the same 180ms ease.
  function settle(toOpen: boolean) {
    open.value = toOpen;
    scroll()?.classList.toggle('rail-open', toOpen);
    classes(false, true);
    scroll()?.style.setProperty('--rail-drag', '0px');   // the padding takes it from here
    wrap()?.style.setProperty('--rail-peek', `${toOpen ? LANE : 0}px`);
    clearTimeout(settling);
    settling = window.setTimeout(() => classes(false, false), SETTLE);
  }
  function end() {
    if (phase === 'idle') return;
    try { wrap()?.releasePointerCapture(pointerId); } catch { /* already gone */ }
    phase = 'idle';
  }
  // The way out of every surprise: settle back to the state that was, no opinion changed.
  function bail() {
    if (phase === 'idle') return;
    end();
    settle(open.value);
  }

  function onDown(event: PointerEvent) {
    pointers += 1;
    if (!options.enabled.value || !event.isPrimary) return;
    if (pointers > 1) { bail(); return; }             // a second finger is not this gesture's business
    // A block that scrolls sideways scrolls itself; the gesture stays out of its way.
    const hscroll = (event.target as HTMLElement | null)?.closest('pre, table, [data-hscroll]');
    if (hscroll && hscroll.scrollWidth > hscroll.clientWidth) return;
    phase = 'pending';
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    fromOpen = open.value;
    samples = [{ x: event.clientX, t: event.timeStamp }];
  }

  function onMove(event: PointerEvent) {
    if (phase === 'idle' || event.pointerId !== pointerId) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    if (phase === 'pending') {
      if (Math.abs(dy) > LOCK && Math.abs(dy) > Math.abs(dx)) { phase = 'idle'; return; }  // the browser is scrolling: let it
      if (Math.abs(dx) <= LOCK || Math.abs(dx) < Math.abs(dy) * BIAS) return;
      phase = 'locked';
      try { wrap()?.setPointerCapture(pointerId); } catch { /* gone: the handlers below reset */ }
      classes(true, false);
    }
    event.preventDefault();
    const now = performance.now();
    samples.push({ x: event.clientX, t: now });
    while (samples.length > 2 && now - samples[0]!.t > 100) samples.shift();
    drag(Math.max(0, Math.min(LANE, (fromOpen ? LANE : 0) + dx)));
  }

  function onUp(event: PointerEvent) {
    pointers = Math.max(0, pointers - 1);
    if (event.pointerId !== pointerId) return;
    if (phase === 'pending') { phase = 'idle'; return; }   // a tap or an abandoned touch: nothing to settle
    if (phase !== 'locked') return;
    end();
    const reveal = Math.max(0, Math.min(LANE, (fromOpen ? LANE : 0) + (event.clientX - startX)));
    const first = samples[0]!, last = samples.at(-1)!;
    const speed = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    settle(speed > FLICK ? true : speed < -FLICK ? false : reveal > LANE / 2);
  }

  function onCancel(event: PointerEvent) {
    pointers = Math.max(0, pointers - 1);
    if (event.pointerId === pointerId) bail();
  }

  let bound: HTMLElement | null = null;
  function attach(el: HTMLElement | null) {
    if (bound === el) return;
    if (bound) {
      bound.removeEventListener('pointerdown', onDown);
      bound.removeEventListener('pointermove', onMove);
      bound.removeEventListener('pointerup', onUp);
      bound.removeEventListener('pointercancel', onCancel);
    }
    bound = el;
    if (el) {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove, { passive: false });
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onCancel);
    }
  }
  watch([options.wrap, options.enabled], ([el, on]) => attach(on ? (el as HTMLElement | null) : null), { immediate: true });
  const onBlur = () => bail();
  window.addEventListener('blur', onBlur);
  onScopeDispose(() => {
    attach(null);
    window.removeEventListener('blur', onBlur);
    clearTimeout(settling);
  });

  return { open };
}
