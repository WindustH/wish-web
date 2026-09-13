// Navigation must never depend on Web Animations events. WAAPI
// finish/cancel events are dispatched from the animation frame update loop:
// an occluded window or a stalled compositor (Wayland workspace switches,
// huge layers on very large viewports) can delay them indefinitely, and a
// router guard that awaits them hangs every navigation — the whole page
// freezes. The deadline keeps the fade visual (the animation still runs and
// cleans up via its own events) while bounding how long navigation waits.
export function navigationDeadline<T>(fade: Promise<T>, ms = 150): Promise<T | 'deadline'> {
  return Promise.race([fade, new Promise<'deadline'>(resolve => setTimeout(() => resolve('deadline'), ms))]);
}
