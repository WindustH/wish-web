import { prefersReducedMotion } from '../../ui/motion/reducedMotion.ts';
// A short glide to the end of a list, for "jump to latest". From far away most
// of the distance is skipped first, so the motion stays brief and the rows in
// between are never rendered. Writes others make while it runs (rows being
// measured, history being anchored, output being followed) are carried along
// rather than fought. Returns a function that cancels it.
const EASE = 95; // ms: the remaining distance shrinks by e every EASE ms

/** One frame of the glide: the remaining distance shrinks exponentially, then snaps. */
export function approach(current: number, target: number, elapsed: number, ease = EASE): number {
  const next = current + (target - current) * (1 - Math.exp(-Math.max(0, elapsed) / ease));
  return Math.abs(target - next) < 0.5 ? target : next;
}

export function glideToEnd(el: HTMLElement): () => void {
  const end = () => Math.max(0, el.scrollHeight - el.clientHeight);
  const reduced = prefersReducedMotion();
  if (reduced) { el.scrollTop = end(); return () => {}; }
  const lead = el.clientHeight * 1.5;
  if (end() - el.scrollTop > lead) el.scrollTop = end() - lead;
  let current = el.scrollTop;
  let written = current;
  let last = 0;
  let frame = requestAnimationFrame(function step(now) {
    frame = 0;
    if (!el.isConnected) return;
    const elapsed = last ? Math.min(now - last, 64) : 16;
    last = now;
    const moved = el.scrollTop - written;
    if (Math.abs(moved) > 1) current += moved;
    const target = end();
    current = approach(current, target, elapsed);
    el.scrollTop = current;
    written = el.scrollTop;
    if (current !== target) frame = requestAnimationFrame(step);
  });
  return () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
}
