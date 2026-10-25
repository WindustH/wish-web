/** Coalesces session invalidations without losing an event received during an in-flight read.
 * The session owns transport cancellation; this coordinator owns only scheduling. A stopped
 * generation can neither unlock a newer run nor schedule work in a newly opened session. */
export function createReconciliation(options: {
  run: () => Promise<void>;
  ready: () => boolean;
  delayMs: number;
  pollMs: number;
}) {
  let generation = 0;
  let active = false;
  let running = false;
  let requested = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;

  function schedule() {
    if (!active || running || timer !== undefined || !requested || !options.ready()) return;
    timer = setTimeout(() => { timer = undefined; void drain(); }, options.delayMs);
  }
  async function drain() {
    if (!active || running || !options.ready()) return;
    const own = generation;
    running = true;
    requested = false;
    try { await options.run(); }
    finally {
      if (own === generation) {
        running = false;
        schedule();
      }
    }
  }
  function request() { requested = true; schedule(); }
  function stop() {
    generation++;
    active = false;
    running = false;
    requested = false;
    clearTimeout(timer); timer = undefined;
    clearInterval(poll); poll = undefined;
  }
  function start() {
    stop();
    active = true;
    poll = setInterval(request, options.pollMs);
  }
  return { start, stop, request };
}
