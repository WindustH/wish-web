import { onBeforeUnmount, type Ref } from 'vue';

type Item = { node: HTMLElement; text: string; box: DOMRect };

/** Temporary drag layout; the editor value changes only when the pointer is released. */
export function useAttachmentTokenDrag(root: Ref<HTMLElement | null>, commit: (text: string, caret: number) => void, restore: () => void) {
  let active: {
    pointer: number; startX: number; startY: number; x: number; y: number;
    offsetX: number; offsetY: number; source: HTMLElement; ghost?: HTMLElement;
    items: Item[]; gap?: HTMLElement; index: number; started: boolean;
  } | undefined;
  let frame = 0;
  const animations = new Map<HTMLElement, Animation>();
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stopAnimations() {
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
  }
  function cleanup() {
    cancelAnimationFrame(frame); frame = 0;
    stopAnimations();
    const drag = active; active = undefined;
    drag?.ghost?.remove();
    if (root.value) {
      root.value.style.removeProperty('caret-color');
      root.value.style.removeProperty('cursor');
      if (drag && root.value.hasPointerCapture(drag.pointer)) root.value.releasePointerCapture(drag.pointer);
    }
    window.removeEventListener('keydown', escape, true);
    window.removeEventListener('blur', cancel);
  }
  function cancel() {
    if (!active) return;
    cleanup(); restore();
  }
  function escape(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
  }
  function begin() {
    const drag = active, editor = root.value;
    if (!drag || !editor) return;
    drag.started = true;
    const style = getComputedStyle(drag.source);
    const ghost = drag.source.cloneNode(true) as HTMLElement;
    // Outside the editable DOM so hit testing, selection and serialization ignore it.
    ghost.removeAttribute('data-attachment-token');
    ghost.removeAttribute('title');
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {
      position: 'fixed', top: '0', left: '0', margin: '0', pointerEvents: 'none', zIndex: '10000',
      font: style.font, lineHeight: style.lineHeight, padding: style.padding,
      background: style.backgroundColor, color: style.color, border: style.border,
      borderRadius: style.borderRadius, boxSizing: 'border-box', width: `${drag.source.getBoundingClientRect().width}px`,
      whiteSpace: 'nowrap', boxShadow: '0 4px 14px #0003', willChange: 'transform',
    });
    document.body.append(ghost); drag.ghost = ghost;
    const fragment = document.createDocumentFragment();
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const node of Array.from(editor.childNodes)) {
      if (node === drag.source) {
        drag.index = drag.items.length;
        const gap = drag.source.cloneNode(true) as HTMLElement;
        gap.style.opacity = '0'; gap.setAttribute('aria-hidden', 'true');
        drag.gap = gap; fragment.append(gap);
      } else if (node instanceof HTMLElement && node.dataset.attachmentToken) {
        const token = node.cloneNode(true) as HTMLElement;
        drag.items.push({ node: token, text: node.dataset.attachmentToken, box: token.getBoundingClientRect() });
        fragment.append(token);
      } else if (node.nodeType === Node.TEXT_NODE) {
        for (const { segment } of segmenter.segment(node.textContent ?? '')) {
          const span = document.createElement('span'); span.textContent = segment;
          // Temporary grapheme boxes let adjacent text animate independently.
          if (segment !== '\n') span.style.display = 'inline-block';
          drag.items.push({ node: span, text: segment, box: span.getBoundingClientRect() });
          fragment.append(span);
        }
      }
    }
    editor.replaceChildren(fragment);
    editor.style.caretColor = 'transparent'; editor.style.cursor = 'grabbing';
    measure();
  }
  function measure() {
    if (!active) return;
    for (const item of active.items) item.box = item.node.getBoundingClientRect();
  }
  function relocate(index: number) {
    const drag = active, editor = root.value;
    if (!drag?.gap || !editor || index === drag.index) return;
    const before = drag.items.map(item => item.node.getBoundingClientRect());
    stopAnimations();
    editor.insertBefore(drag.gap, drag.items[index]?.node ?? null);
    drag.index = index;
    measure();
    if (reducedMotion()) return;
    drag.items.forEach((item, i) => {
      const old = before[i]!;
      const dx = old.left - item.box.left, dy = old.top - item.box.top;
      if (Math.abs(dx) + Math.abs(dy) < .5 || item.text === '\n') return;
      // Animate from the current visual position, including an unfinished transition.
      const animation = item.node.animate([
        { transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' },
      ], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
      animations.set(item.node, animation);
      animation.onfinish = () => { if (animations.get(item.node) === animation) animations.delete(item.node); };
    });
  }
  function tick() {
    frame = 0;
    const drag = active, editor = root.value;
    if (!drag?.ghost || !editor) return;
    drag.ghost.style.transform = `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0)`;
    const bounds = editor.getBoundingClientRect();
    const scroll = drag.y < bounds.top + 24 ? -6 : drag.y > bounds.bottom - 24 ? 6 : 0;
    if (scroll) {
      const previous = editor.scrollTop;
      editor.scrollTop += scroll;
      if (previous !== editor.scrollTop) { stopAnimations(); measure(); }
    }
    const gap = drag.gap!.getBoundingClientRect();
    // Keep the current slot until the pointer leaves it, preventing oscillation.
    if (!(drag.x >= gap.left - 3 && drag.x <= gap.right + 3 && drag.y >= gap.top && drag.y <= gap.bottom)) {
      let best = Infinity, index = drag.index;
      drag.items.forEach((item, i) => {
        const b = item.box;
        const dy = drag.y < b.top ? b.top - drag.y : drag.y > b.bottom ? drag.y - b.bottom : 0;
        for (const [x, candidate] of [[b.left, i], [b.right, i + 1]] as const) {
          const distance = Math.abs(drag.x - x) + dy * 4;
          if (distance < best) { best = distance; index = candidate; }
        }
      });
      relocate(index);
    }
    if (scroll) frame = requestAnimationFrame(tick);
  }
  function down(event: PointerEvent) {
    if (active || !event.isPrimary || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : (event.target as Node)?.parentElement;
    const source = target?.closest<HTMLElement>('[data-attachment-token]');
    if (!source || !root.value?.contains(source)) return;
    event.preventDefault();
    const box = source.getBoundingClientRect();
    active = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top,
      source, items: [], index: 0, started: false };
    root.value.setPointerCapture(event.pointerId);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
  }
  function move(event: PointerEvent) {
    const drag = active;
    if (!drag || drag.pointer !== event.pointerId) return;
    event.preventDefault();
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 4) begin();
    if (drag.started && !frame) frame = requestAnimationFrame(tick);
  }
  function up(event: PointerEvent) {
    const drag = active;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.started) { cleanup(); return; }
    drag.x = event.clientX; drag.y = event.clientY;
    cancelAnimationFrame(frame); tick();
    const token = drag.source.dataset.attachmentToken!;
    const before = drag.items.slice(0, drag.index).map(item => item.text).join('');
    const after = drag.items.slice(drag.index).map(item => item.text).join('');
    const ghost = drag.ghost!;
    const from = ghost.getBoundingClientRect(), to = drag.gap!.getBoundingClientRect();
    // Let the floating tag settle into its slot while the editor returns to normal DOM.
    drag.ghost = undefined;
    cleanup(); commit(before + token + after, before.length + token.length);
    if (reducedMotion()) { ghost.remove(); return; }
    let offset = 0;
    const destination = Array.from(root.value?.childNodes ?? []).find(node => {
      const text = node instanceof HTMLElement ? node.dataset.attachmentToken ?? node.textContent ?? '' : node.textContent ?? '';
      const matches = offset === before.length && node instanceof HTMLElement && node.dataset.attachmentToken === token;
      offset += text.length; return matches;
    }) as HTMLElement | undefined;
    if (destination) destination.style.opacity = '0';
    const finish = () => { destination?.style.removeProperty('opacity'); ghost.remove(); };
    const animation = ghost.animate([
      { transform: `translate3d(${from.left}px,${from.top}px,0)`, opacity: 1 },
      { transform: `translate3d(${to.left}px,${to.top}px,0)`, opacity: 1, boxShadow: '0 0 0 #0000' },
    ], { duration: 140, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    animation.onfinish = finish;
    animation.oncancel = finish;
  }
  onBeforeUnmount(cleanup);
  return { down, move, up, cancel, isActive: () => !!active };
}
