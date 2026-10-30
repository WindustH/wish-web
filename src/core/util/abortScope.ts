// Caller cancellation and deadlines without AbortSignal.any/timeout. Explicit disposal also
// releases listeners when a request finishes normally, including while its body is being read.
export function createAbortScope(signals: readonly AbortSignal[] = [], timeoutMs?: number) {
  const controller = new AbortController();
  const releases: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  function dispose() {
    clearTimeout(timer);
    for (const release of releases.splice(0)) release();
  }
  function abort(signal: AbortSignal) {
    if (!controller.signal.aborted) controller.abort(signal.reason);
    dispose();
  }
  for (const signal of signals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    const listener = () => abort(signal);
    signal.addEventListener('abort', listener, { once: true });
    releases.push(() => signal.removeEventListener('abort', listener));
  }
  if (!controller.signal.aborted && timeoutMs !== undefined)
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('Request timed out', 'TimeoutError'));
      dispose();
    }, timeoutMs);
  return {
    signal: controller.signal,
    dispose,
    get timedOut() {
      return timedOut;
    },
  };
}
