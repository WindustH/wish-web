// Minimal dependency-free reactive primitives for core state.
// Deliberately small: `signal` holds a value and notifies subscribers;
// `derive` produces a read-only view of other signals (recomputed
// eagerly, cheap for UI-sized state); `autorun` re-runs when tracked
// signals change. Headless hosts (Tauri/Capacitor shells, tests) can
// observe the exact same state the browser UI renders.

const TRACKING = [];

function subscribeRefresh(node) {
  for (const t of TRACKING) t.deps.add(node);
}

export function signal(initial) {
  const node = { value: initial, subs: new Set(), watchers: new Set() };
  return {
    __signal: true,
    get value() { subscribeRefresh(node); return node.value; },
    set value(v) {
      if (Object.is(v, node.value)) return;
      node.value = v;
      for (const fn of [...node.subs]) {
        try { fn(v); } catch (err) { console.error('[signal]', err); }
      }
      for (const w of [...node.watchers]) w.run();
    },
    peek: () => node.value,
    subscribe(fn) { node.subs.add(fn); return () => node.subs.delete(fn); },
    _node: node,
  };
}

export function derive(fn) {
  const inner = signal(undefined);
  const node = { deps: new Set(), run() { inner.value = fn(); } };
  TRACKING.push(node);
  try { inner.value = fn(); } finally { TRACKING.pop(); }
  for (const dep of node.deps) dep.watchers.add(node);
  const sig = {
    __signal: true, __derived: true,
    get value() { subscribeRefresh(inner._node); return inner.value; },
    peek: () => inner.value,
    subscribe(fn) { return inner.subscribe(fn); },
  };
  return sig;
}

export function autorun(fn) {
  const node = { deps: new Set(), run() { step(); } };
  let first = true;
  function step() {
    const prev = TRACKING.splice(0, TRACKING.length);
    TRACKING.push(node);
    node.deps.clear();
    try { fn(first); } finally {
      const deps = node.deps;
      TRACKING.pop();
      TRACKING.push(...prev);
      // (re)bind: subscribe to every signal touched by this run
      for (const d of deps) d.watchers.add(node);
      first = false;
    }
  }
  step();
  return () => { for (const d of node.deps || []) d.watchers.delete(node); };
}
