// Hooks (vendored preact/hooks) + bridge hooks for the core reactive system
// and small conveniences used across features.
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useReducer, useContext } from 'preact/hooks';
import { createContext } from 'preact';

export {
  useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback,
  useReducer, useContext, createContext,
};

/** Re-render whenever a core signal changes. */
export function useSignal(sig) {
  const [, force] = useState(0);
  const value = sig.peek();
  useLayoutEffect(() => {
    const refresh = () => force((n) => n + 1);
    const unsubscribe = sig.subscribe(refresh);
    // A signal may change after render but before this subscription exists.
    if (!Object.is(value, sig.peek())) refresh();
    return unsubscribe;
  }, [sig]);
  return value;
}

/** Re-render on every bus event of `topic`. */
export function useBus(topic, deps = []) {
  const [, force] = useState(0);
  useEffect(() => {
    let alive = true;
    import('../core/bus.js').then(({ bus }) => {
      if (!alive) return;
      const off = bus.on(topic, () => force((n) => n + 1));
      off._keep = off;
      force((n) => n + 1);
      cleanupFn = off;
    });
    let cleanupFn = null;
    return () => { alive = false; cleanupFn?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Media query subscription (SSR-safe). */
export function useMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof matchMedia !== 'undefined' ? matchMedia(query).matches : false);
  useEffect(() => {
    const mq = matchMedia(query);
    const fn = () => setMatches(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return matches;
}

/** Click-outside dismiss. */
export function useDismiss(ref, onDismiss, active = true) {
  useEffect(() => {
    if (!active) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onDismiss(e);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [ref, onDismiss, active]);
}

/** Escape key handler. */
export function useEscape(fn, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // A native <dialog> is always in the top layer: while one is open,
      // Escape belongs to it, not to the sheet behind it.
      if (document.querySelector('dialog[open]')) return;
      fn(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fn, active]);
}
