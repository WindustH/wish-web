// A rejected background task must not repeatedly take keyboard or touch focus away.
// Explicit actions still present their own errors; this is the last-resort notification.
export function createUnhandledRejectionReporter(notify: () => void, now = Date.now) {
  let lastNotice = -Infinity;
  return (event: Pick<PromiseRejectionEvent, 'reason' | 'preventDefault'>) => {
    event.preventDefault();
    if (event.reason?.name === 'AbortError') return;
    console.error('Unhandled promise rejection:', event.reason);
    const at = now();
    if (at - lastNotice < 5000) return;
    lastNotice = at;
    notify();
  };
}
