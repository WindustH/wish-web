// Chunked windowing for long lists: items are grouped into chunks; only
// chunks near the viewport are mounted, the rest are spacers whose height
// is measured WHILE MOUNTED (review: unmount-only measurement rendered a
// stale spacer first and jumped). DOM stays bounded regardless of data size.
//
// Review fixes:
//  · a caller's onScroll is FORWARDED, not overridden (ours composed after
//    the spread so it always wins the prop slot);
//  · heights refresh on every layout pass of a mounted chunk;
//  · the render window SURVIVES data growth: append keeps indexes, prepend
//    (older history) shifts indexes by the chunks added so the viewport's
//    chunks stay mounted (no jump-to-top on load-older), and only a
//    datasetKey change resets (initialWindow 'top'|'bottom').
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
  ...rest
}) {
  const chunkSize = cfg.windowing.chunkSize;
  const keep = cfg.windowing.keepChunks;
  const chunkCount = Math.max(1, Math.ceil(items.length / chunkSize));
  const [win, setWin] = useState(() => defaultWindow(initialWindow, chunkCount, keep));
  const winRef = useRef(win);
  winRef.current = win;
  const heights = useRef(new Map());   // "start:len" -> px
  const wrapRef = useRef(null);
  const metaRef = useRef({ key: datasetKey, len: items.length, firstKey: items.length ? keyOf(items[0], 0) : '' });

  const { onScroll: restOnScroll, ...restNoScroll } = rest;

  function defaultWindow(mode, count, k) {
    if (mode === 'bottom') return [Math.max(0, count - 1 - k * 2), Math.max(0, count - 1)];
    return [0, Math.min(count - 1, k * 2)];
  }

  // Window continuity across data changes.
  useLayoutEffect(() => {
    const meta = metaRef.current;
    const firstKey = items.length ? keyOf(items[0], 0) : '';
    if (datasetKey !== meta.key || (!meta.len && items.length)) {
      if (datasetKey !== meta.key) heights.current.clear();
      setWin(defaultWindow(initialWindow, chunkCount, keep));
    } else if (items.length > meta.len && firstKey !== meta.firstKey) {
      // Growth at the START (older pages prepended): shift the window so
      // the chunks in the viewport stay mounted.
      const delta = items.length - meta.len;
      const chunksAdded = Math.ceil(delta / chunkSize);
      setWin(([lo, hi]) => [lo + chunksAdded, Math.min(chunkCount - 1, hi + chunksAdded)]);
    } else if (items.length < meta.len) {
      // Shrink (eviction / reload): clamp into range.
      setWin(([lo, hi]) => [Math.min(lo, chunkCount - 1), Math.min(hi, chunkCount - 1)]);
    }
    metaRef.current = { key: datasetKey, len: items.length, firstKey };
  }, [datasetKey, items.length, chunkCount]);

  // Re-evaluate after data growth so a bottom-pinned view follows new chunks.
  useEffect(() => { update(); }, [items.length, win[0], win[1]]);

  // The real scroll viewport is the nearest scrollable ANCESTOR (e.g. the
  // chat log's .chatlog) — this component itself never scrolls. Listening on
  // the inner div would see no events, and comparing chunk rects against the
  // inner div's full-height rect would mark every chunk "visible".
  const scrollHostRef = useRef(null);
  useLayoutEffect(() => {
    let el = wrapRef.current?.parentElement;
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      if (/(auto|scroll|overlay)/.test(`${st.overflowY}${st.overflow}`)) break;
      el = el.parentElement;
    }
    scrollHostRef.current = el || document.scrollingElement || document.documentElement;
    const host = scrollHostRef.current;
    const onHostScroll = (e) => { restOnScroll?.(e); update(); };
    host.addEventListener('scroll', onHostScroll, { passive: true });
    update();
    return () => host.removeEventListener('scroll', onHostScroll);
  }, []);

  function update() {
    if (update.pending) return;
    update.pending = requestAnimationFrame(() => {
      update.pending = 0;
      const root = wrapRef.current;
      const host = scrollHostRef.current;
      if (!root || !host) return;
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
      const lo = Math.max(0, first - keep);
      const hi = Math.min(chunkCount - 1, last + keep);
      const [plo, phi] = winRef.current;
      if (lo !== plo || hi !== phi) setWin([lo, hi]);
    });
  }

  const onScroll = (e) => {
    restOnScroll?.(e);
    update();
  };

  const chunks = [];
  for (let c = 0; c < chunkCount; c++) {
    const start = c * chunkSize;
    const slice = items.slice(start, start + chunkSize);
    const hkey = `${start}:${slice.length}`;
    if (c >= win[0] && c <= win[1]) {
      chunks.push(html`<${Chunk} key=${'c' + keyOf(items[start], start)}
        index=${c} items=${slice} start=${start} render=${render} keyOf=${keyOf}
        heights=${heights.current} hkey=${hkey} />`);
    } else {
      const h = heights.current.get(hkey) ?? slice.length * estimate;
      chunks.push(html`<div key=${'s' + keyOf(items[start], start)} data-chunk=${c}
        class="vlist-spacer" style=${{ minHeight: `${h}px` }} />`);
    }
  }

  // Spread FIRST, our composed onScroll LAST (never overridden).
  return html`<div class=${'vlist ' + className} ref=${wrapRef} ...${restNoScroll} onScroll=${onScroll}>
    ${chunks}
  </div>`;
}

function Chunk({ index, items, start, render, keyOf, heights, hkey }) {
  const ref = useRef(null);
  // Measure on EVERY layout pass while mounted — content growth inside a
  // chunk updates the spacer height before it ever unmounts. (A detached
  // element has no layout, so unmount-time capture would record 0.)
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) heights.set(hkey, el.offsetHeight);
  });
  return html`<div class="vlist-chunk" data-chunk=${index} ref=${ref}>
    ${items.map((it, i) => render(it, start + i))}
  </div>`;
}
