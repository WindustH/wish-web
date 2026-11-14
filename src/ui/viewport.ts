/** Keep the app inside the visible viewport when a software keyboard pans/resizes it.
 * iOS does not honor interactive-widget=resizes-content, and dvh excludes the keyboard.
 * The document itself never scrolls: transcripts, forms and panels own their scroll.
 */
export function installViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  const touch = matchMedia('(any-pointer: coarse)');
  let frame = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];

  function update() {
    frame = 0;
    // Pinch zoom must not resize the application or have its pan reset.
    if (Math.abs(viewport!.scale - 1) > 0.01 || viewport!.height <= 0) return;
    const layoutHeight = root.clientHeight;
    const height = Math.min(layoutHeight, viewport!.height);
    const hidden = Math.max(0, layoutHeight - height);
    // A late offset can outlive keyboard dismissal. Never move a full-height
    // app down by that stale offset, which would leave a scrollable blank strip.
    const top = Math.max(0, Math.min(viewport!.offsetTop, hidden));
    root.style.setProperty('--viewport-height', `${height}px`);
    root.style.setProperty('--viewport-top', `${top}px`);
    root.style.setProperty('--viewport-bottom', `${hidden - top}px`);
    const editing = document.activeElement?.matches(
      'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea, [contenteditable]:not([contenteditable=false])',
    );
    root.classList.toggle('keyboard-open', !!editing && hidden > 80);
    // Safari may retain a document scroll after dismissing its keyboard, even
    // with overflow hidden. Reset only that outer scroll, never a message/form.
    if (touch.matches && (!editing || hidden < 80) && (window.scrollX || window.scrollY))
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function settle() {
    for (const timer of timers) clearTimeout(timer);
    schedule();
    // WebKit can publish its final viewport/scroll values after focusout and
    // after the keyboard animation. Finite checks also handle missing events.
    timers = [100, 350, 700].map((delay) => setTimeout(schedule, delay));
  }
  function documentScrolled(event: Event) {
    if (event.target === document) schedule();
  }
  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  window.addEventListener('resize', settle);
  window.addEventListener('pageshow', settle);
  document.addEventListener('focusin', settle);
  document.addEventListener('focusout', settle);
  document.addEventListener('scroll', documentScrolled);
  update();
  return () => {
    cancelAnimationFrame(frame);
    for (const timer of timers) clearTimeout(timer);
    viewport.removeEventListener('resize', schedule);
    viewport.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', settle);
    window.removeEventListener('pageshow', settle);
    document.removeEventListener('focusin', settle);
    document.removeEventListener('focusout', settle);
    document.removeEventListener('scroll', documentScrolled);
    for (const name of ['--viewport-height', '--viewport-top', '--viewport-bottom']) root.style.removeProperty(name);
    root.classList.remove('keyboard-open');
  };
}
