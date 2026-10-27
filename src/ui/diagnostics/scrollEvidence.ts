// Geometry fallback preserves evidence when a pane is skipped by hit testing.
// It is diagnostic only: it never forwards input or changes page styles.
export function scrollRegionAt(x: number, y: number): HTMLElement | null {
  for (const element of document.elementsFromPoint(x, y)) {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (
        node instanceof HTMLElement &&
        /auto|scroll/.test(getComputedStyle(node).overflowY) &&
        node.scrollHeight > node.clientHeight + 1
      )
        return node;
    }
  }
  for (const node of document.querySelectorAll<HTMLElement>('.chatlog, .sl-scroll')) {
    const box = node.getBoundingClientRect();
    if (
      box.width &&
      box.height &&
      x >= box.left &&
      x < box.right &&
      y >= box.top &&
      y < box.bottom &&
      node.scrollHeight > node.clientHeight + 1
    )
      return node;
  }
  return null;
}

export function scrollRegionState(node: HTMLElement | null) {
  if (!node) return null;
  const ancestors = [];
  for (let element: HTMLElement | null = node; element && ancestors.length < 8; element = element.parentElement) {
    const style = getComputedStyle(element),
      box = element.getBoundingClientRect();
    ancestors.push({
      tag: element.tagName.toLowerCase(),
      classes: [...element.classList].slice(0, 4),
      inert: element.inert,
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
      display: style.display,
      opacity: style.opacity,
      overflowY: style.overflowY,
      transform: style.transform,
      zIndex: style.zIndex,
      bounds: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
      animations: element
        .getAnimations()
        .map((animation) => ({ state: animation.playState, currentTime: animation.currentTime })),
    });
  }
  return {
    top: node.scrollTop,
    height: node.scrollHeight,
    viewport: node.clientHeight,
    connected: node.isConnected,
    ancestors,
  };
}
