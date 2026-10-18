// The text under a point on the screen, for gestures that act on words rather than on elements.

/** Whether a box covers the point. */
export const covers = (box: DOMRect, x: number, y: number) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/**
 * The caret position nearest the point, in whichever spelling the browser has. Text that cannot be
 * selected has no caret positions, so text under `within` is made selectable for the moment of the
 * reading: no gesture of the platform's can see it.
 */
export function caretAt(x: number, y: number, within?: Element): { node: Node; offset: number } | null {
  within?.classList.add('reading-caret');
  try {
    const caret = document.caretPositionFromPoint?.(x, y);
    if (caret) return { node: caret.offsetNode, offset: caret.offset };
    const range = document.caretRangeFromPoint?.(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  } finally {
    within?.classList.remove('reading-caret');
  }
}

/**
 * The character of `root`'s text under the point, or null over the blank. The nearest caret is not
 * enough on its own: it snaps to the closest character from anywhere in the blank, so a character
 * beside it has to cover the point itself.
 */
export function glyphAt(x: number, y: number, root: Element): { node: Text; index: number } | null {
  const caret = caretAt(x, y, root);
  if (!caret || !(caret.node instanceof Text) || !root.contains(caret.node)) return null;
  const glyph = document.createRange();
  for (const index of [caret.offset - 1, caret.offset]) {
    if (index < 0 || index >= caret.node.length) continue;
    glyph.setStart(caret.node, index);
    glyph.setEnd(caret.node, index + 1);
    if ([...glyph.getClientRects()].some(box => covers(box, x, y))) return { node: caret.node, index };
  }
  return null;
}
