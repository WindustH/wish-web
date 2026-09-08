// Chunked windowing for long lists: items are grouped into chunks; only
// chunks near the viewport are mounted, the rest render as spacers with
// measured heights. DOM stays bounded regardless of data size.
//
// Invariants (review round-3):
//  · ALL window arithmetic reads refs — the host-scroll listener and rAF
//    callback never capture a stale chunkCount from an early render;
//  · one rAF slot kept in a ref, cancelled on unmount;
//  · chunk heights are keyed by CONTENT identity (keyOf of the chunk's
//    first item + its length), so prepends reuse existing measurements and
//    self-invalidate when a chunk's content changes;
//  · mounted chunks observe their own box (ResizeObserver) — image loads
//    and expand/collapse inside a chunk update its spacer height;
//  · the scroll viewport is the nearest scrollable ANCESTOR (this
//    component never scrolls itself);
//  · an EMPTY dataset renders no chunks at all (no keyOf(undefined)).
import { html } from '../h.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cfg } from '../../core/config.js';

export function Vlist({
  items,            // array
  render,           // (item, index) => vnode (carry a key!)
  keyOf,            // (item, index) => string
  estimate = 56,    // px per item before measurement
  className = '',
  datasetKey = '',  // identity of the dataset (session id / query); change → reset
  initialWindow = 'top',
  revealIndex = null,  // item index to reveal: extends the window to its chunk
  ...rest
}) {
  const chunkSize = cfg.windowing.chunkSize;
  const keep = cfg.windowing.keepChunks;
  const chunkCount = items.length ? Math.ceil(items.length / chunkSize) : 0;

  const [win, setWin] = useState(() => defaultWindow(initialWindow, chunkCount, keep));
  const winRef = useRef(win);
  winRef.current = win;

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const chunkCountRef = useRef(chunkCount);
  chunkCountRef.current = chunkCount;
  const heights = useRef(new Map());    // contentKey -> px
  const wrapRef = useRef(null);
  const hostRef = useRef(null);
  const rafRef = useRef(0);
  const metaRef = useRef({ key: datasetKey, len: items.length, firstKey: items.length ? keyOf(items[0], 0) : '' });
  const restOnScrollRef = useRef(rest.onScroll);
  restOnScrollRef.current = rest.onScroll;
  const { onScroll: _drop, ...restNoScroll } = rest;

  const chunkContentKey = (idx) => {
    const its = itemsRef.current;
    const start = idx * chunkSize;
    const first = its[start];
    if (first == null) return null;
    return `${keyOf(first, start)}:${Math.min(chunkSize, its.length - start)}`;
  };

  function defaultWindow(mode, count, k) {
    if (!count) return [0, -1];                       // empty: no chunks
    if (mode === 'bottom') return [Math.max(0, count - 1 - k * 2), count - 1];
    return [0, Math.min(count - 1, k * 2)];
  }

  const applyWin = (next) => {
    const cur = winRef.current;
    if (next[0] !== cur[0] || next[1] !== cur[1]) {
      winRef.current = next;
      setWin(next);
    }
  };

  // ── window continuity across data changes (one code path) ────────────
  useLayoutEffect(() => {
    const meta = metaRef.current;
    const firstKey = items.length ? keyOf(items[0], 0) : '';
    const count = chunkCountRef.current;
    if (datasetKey !== meta.key || (!meta.len && items.length)) {
      if (datasetKey !== meta.key) heights.current.clear();
      applyWin(defaultWindow(initialWindow, count, keep));
    } else if (items.length > meta.len && firstKey !== meta.firstKey) {
      // Prepend (older pages): shift the window by the chunks added so the
      // viewport's chunks stay mounted — the scroll compensation happens in
      // the caller (scrollTop = scrollHeight − prevHeight).
      const chunksAdded = Math.ceil((items.length - meta.len) / chunkSize);
      const [lo, hi] = winRef.current;
      applyWin([lo + chunksAdded, Math.min(count - 1, hi + chunksAdded)]);
    } else if (items.length > meta.len && winRef.current[1] === Math.max(0, Math.ceil(meta.len / chunkSize) - 1)) {
      // Append while pinned at the tail: follow the new last chunk.
      applyWin([winRef.current[0], count - 1]);
    } else if (items.length < meta.len) {
      // Shrink (reload / eviction): clamp into range.
      const [lo, hi] = winRef.current;
      applyWin([Math.min(lo, Math.max(0, count - 1)), Math.min(hi, count - 1)]);
    }
    metaRef.current = { key: datasetKey, len: items.length, firstKey };
  }, [datasetKey, items.length, chunkCount]);

  // Re-evaluate after data/window changes so a bottom-pinned view follows.
  useEffect(() => { update(); }, [items.length, win[0], win[1]]);

  // Reveal: extend (never shrink) the window to include the target item's
  // chunk — a search hit deep in resident data must be mounted before the
  // caller can scroll to it (round-3 #1).
  const revealChunkRef = useRef(null);
  useLayoutEffect(() => {
    if (revealIndex == null || !chunkCount) { revealChunkRef.current = null; return; }
    const c = Math.floor(revealIndex / chunkSize);
    // JUMP to a bounded window around the target chunk. Bridging the span
    // (min/max extension) would mount EVERY chunk between the old window
    // and a deep target — unbounded DOM. The old viewport area becomes
    // spacers; update() finds no visible chunk there and leaves the pin
    // alone until the caller's scrollIntoView lands on the target and the
    // normal viewport computation resumes (round-4).
    revealChunkRef.current = c;
    applyWin([Math.max(0, c - keep), Math.min(chunkCount - 1, c + keep)]);
  }, [revealIndex, chunkCount, items.length]);

  // ── scroll host wiring (stable: reads refs only) ──────────────────────
  useLayoutEffect(() => {
    let el = wrapRef.current?.parentElement;
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      if (/(auto|scroll|overlay)/.test(`${st.overflowY}${st.overflow}`)) break;
      el = el.parentElement;
    }
    hostRef.current = el || document.scrollingElement || document.documentElement;
    const host = hostRef.current;
    const onHostScroll = (e) => { restOnScrollRef.current?.(e); update(); };
    host.addEventListener('scroll', onHostScroll, { passive: true });
    const ro = new ResizeObserver(() => update());
    ro.observe(host);
    update();
    return () => {
      host.removeEventListener('scroll', onHostScroll);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, []);

  function update() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const root = wrapRef.current;
      const host = hostRef.current;
      if (!root || !host) return;
      const count = chunkCountRef.current;
      if (!count) return;
      const rect = host.getBoundingClientRect();
      let first = -1, last = -1;
      const kids = root.children;
      for (let i = 0; i < kids.length; i++) {
        const el = kids[i];
        const ci = el.dataset?.chunk;
        if (ci == null) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom > rect.top && r.top < rect.bottom) {
          const c = Number(ci);
          if (first < 0) first = c;
          last = c;
        }
      }
      if (first < 0) return;
      let lo = Math.max(0, first - keep);
      let hi = Math.min(count - 1, last + keep);
      // A pinned reveal chunk stays mounted until it is actually visible
      // (the mount-time update() would otherwise snap the window back to
      // the old viewport before the caller gets to scroll to the target).
      const rc = revealChunkRef.current;
      if (rc != null) {
        lo = Math.min(lo, rc);
        hi = Math.max(hi, rc);
        if (first <= rc && rc <= last) revealChunkRef.current = null;   // released
      }
      applyWin([lo, hi]);
    });
  }

  const chunks = [];
  for (let c = 0; c < chunkCount; c++) {
    const start = c * chunkSize;
    const slice = items.slice(start, start + chunkSize);
    const ckey = chunkContentKey(c);
    const key0 = keyOf(items[start], start);
    if (c >= win[0] && c <= win[1]) {
      chunks.push(html`<${Chunk} key=${'c' + key0}
        index=${c} items=${slice} start=${start} render=${render} keyOf=${keyOf}
        heights=${heights.current} contentKey=${ckey} />`);
    } else {
      const h = heights.current.get(ckey) ?? slice.length * estimate;
      chunks.push(html`<div key=${'s' + key0} data-chunk=${c}
        class="vlist-spacer" style=${{ minHeight: `${h}px` }} />`);
    }
  }

  // Spread FIRST, our composed onScroll LAST (never overridden).
  return html`<div class=${'vlist ' + className} ref=${wrapRef} ...${restNoScroll} onScroll=${update}>
    ${chunks}
  </div>`;
}

function Chunk({ index, items, start, render, keyOf, heights, contentKey }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    heights.set(contentKey, el.offsetHeight);
    // Content can resize after layout (image loads, expand/collapse) —
    // keep the future spacer height honest.
    const ro = new ResizeObserver(() => { if (ref.current) heights.set(contentKey, ref.current.offsetHeight); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentKey]);
  return html`<div class="vlist-chunk" data-chunk=${index} ref=${ref}>
    ${items.map((it, i) => render(it, start + i))}
  </div>`;
}
