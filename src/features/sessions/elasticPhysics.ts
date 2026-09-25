// Position is measured in pixels from the scroll limit; velocity is px/s.
const SPRING = 260;
const DAMPING = 24;
export const MAX_STRETCH = 48;

export function wheelPixels(delta: number, mode: number, viewportHeight: number): number {
  return delta * (mode === 1 ? 16 : mode === 2 ? viewportHeight : 1);
}

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

export function stretchFromDrag(raw: number): number {
  return Math.sign(raw) * MAX_STRETCH * (1 - Math.exp(-Math.abs(raw) / 90));
}
