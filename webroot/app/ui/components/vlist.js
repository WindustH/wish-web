// Chunked windowing for long lists (task 8 / decisions 30): items are
// grouped into chunks; only chunks near the viewport are mounted, the rest
// are spacers whose height was measured while mounted — scroll position is
// stable when chunks swap in/out (scroll anchoring by construction).
// DOM stays bounded no matter how much data the slice holds.
import { html } from '../h.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cfg } from '../../core/config.js';

export function Vlist({
  items,            // array
  render,           // (item, index) => vnode (carry a key!)
  keyOf,            // (item, index) => string
  estimate = 56,    // px per item before measurement
  className = '',
  ...rest           // spread onto container (onScroll etc.)
}) {
  const chunkSize = cfg.windowing.chunkSize;
  const keep = cfg.windowing.keepChunks;
  const chunkCount = Math.ceil(items.length / chunkSize);
  const [win, setWin] = useState(() => [0, Math.min(chunkCount - 1, keep * 2)]);
  const winRef = useRef(win);
  winRef.current = win;
  const heights = useRef(new Map());   // "start:len" -> px
  const wrapRef = useRef(null);

  // Reset the render window when the dataset identity changes.
  const firstKey = items.length ? keyOf(items[0], 0) : '';
  useEffect(() => {
    heights.current.clear();
    setWin([0, Math.min(chunkCount - 1, keep * 2)]);
  }, [firstKey, chunkCount]);

  function update() {
    if (update.pending) return;
    update.pending = requestAnimationFrame(() => {
      update.pending = 0;
      const root = wrapRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
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
    rest.onScroll?.(e);
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

  return html`<div class=${'vlist ' + className} ref=${wrapRef} onScroll=${onScroll} ...${rest}>
    ${chunks}
  </div>`;
}

function Chunk({ index, items, start, render, keyOf, heights, hkey }) {
  const ref = useRef(null);
  // Record the real height right before unmount so the spacer that
  // replaces this chunk preserves scroll position.
  useLayoutEffect(() => {
    const el = ref.current;
    return () => { if (el && el.offsetHeight) heights.set(hkey, el.offsetHeight); };
  }, [hkey]);
  return html`<div class="vlist-chunk" data-chunk=${index} ref=${ref}>
    ${items.map((it, i) => render(it, start + i))}
  </div>`;
}
