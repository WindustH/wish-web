/** Follow a row's layout only when it changes, without an idle animation-frame loop. */
export function observeLayout(
  element: Element,
  changed: () => void,
  options: { scroll?: boolean; ignore?: () => Element | null | undefined } = {},
): () => void {
  let frame = 0;
  const schedule = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        changed();
      });
  };
  const resize = new ResizeObserver(schedule);
  const mutations = new MutationObserver((records) => {
    const ignored = options.ignore?.();
    if (
      records.some((record) => {
        if (ignored?.contains(record.target)) return false;
        if (record.type !== 'childList') return true;
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) => node.nodeType !== Node.COMMENT_NODE && !ignored?.contains(node),
        );
      })
    )
      schedule();
  });
  const content = element.closest('[data-selection-viewport], .chatlog-inner, .virtual-rows') ?? element.parentElement;
  // Body portals are outside this subtree; local overlays opt out above so
  // observing their own redraws cannot create a feedback loop.
  const subtree = content && content !== document.body ? content : element;
  mutations.observe(subtree, { childList: true, subtree: true, characterData: true, attributes: true });
  for (let node: Element | null = element; node; node = node.parentElement) {
    resize.observe(node);
    if (!subtree.contains(node)) mutations.observe(node, { attributes: true });
  }
  if (options.scroll !== false) addEventListener('scroll', schedule, { capture: true, passive: true });
  addEventListener('resize', schedule);
  addEventListener('transitionend', schedule, true);
  addEventListener('animationend', schedule, true);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
    if (options.scroll !== false) removeEventListener('scroll', schedule, true);
    removeEventListener('resize', schedule);
    removeEventListener('transitionend', schedule, true);
    removeEventListener('animationend', schedule, true);
  };
}
