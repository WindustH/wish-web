// Position is measured in pixels from the scroll limit; velocity is px/s.
// A soft, slightly underdamped spring (damping ratio about 0.78): the content
// overshoots, then settles back over most of a second with a hint of
// follow-through instead of snapping.
const SPRING = 70;
const DAMPING = 13;
export const MAX_STRETCH = 96;

export function stepSpring(position: number, velocity: number, elapsedMs: number): { position: number; velocity: number } {
  const dt = Math.min(Math.max(elapsedMs, 0), 32) / 1000;
  velocity += (-SPRING * position - DAMPING * velocity) * dt;
  position += velocity * dt;
  if (Math.abs(position) > MAX_STRETCH) {
    position = Math.sign(position) * MAX_STRETCH;
    if (Math.sign(velocity) === Math.sign(position)) velocity = 0;
  }
  if (Math.abs(position) < 0.15 && Math.abs(velocity) < 1) return { position: 0, velocity: 0 };
  return { position, velocity };
}

