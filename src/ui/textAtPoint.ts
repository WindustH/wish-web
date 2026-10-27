// The text under a point on the screen, for gestures that act on words rather than on elements.

/** The text a held finger selects in: what a message says. base.css names the same parts. */
export const SELECTABLE_TEXT = '[data-selectable-text]';

/** Whether a box covers the point. */
export const covers = (box: DOMRect, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

// A glyph box omits the leading above/below the font. Treat that space as part
// of its line, without extending horizontally into message padding or blank columns.
function coversTextLine(box: DOMRect, x: number, y: number, parent: Element): boolean {
  const style = getComputedStyle(parent);
  const lineHeight = parseFloat(style.lineHeight);
  const leading = Number.isFinite(lineHeight) ? Math.max(0, (lineHeight - box.height) / 2) : 0;
  return (
    box.width > 0 && x >= box.left && x <= box.right && y >= box.top - leading - 1 && y <= box.bottom + leading + 1
  );
}

/** Hit only selected text lines, including their leading; never whole element rectangles. */
export function selectionCovers(range: Range, x: number, y: number): boolean {
  const common = range.commonAncestorContainer;
  const walker = document.createTreeWalker(common instanceof Text ? common.parentNode! : common, NodeFilter.SHOW_TEXT);
  const piece = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node) || !node.parentElement) continue;
    piece.selectNodeContents(node);
    if (node === range.startContainer) piece.setStart(node, range.startOffset);
    if (node === range.endContainer) piece.setEnd(node, range.endOffset);
    if ([...piece.getClientRects()].some((box) => coversTextLine(box, x, y, node.parentElement!))) return true;
  }
  return false;
}

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
 * beside it has to cover the point horizontally and within its full line height.
 */
export function glyphAt(x: number, y: number, root: Element): { node: Text; index: number } | null {
  const caret = caretAt(x, y, root);
  if (!caret || !(caret.node instanceof Text) || !root.contains(caret.node)) return null;
  const glyph = document.createRange();
  for (const index of [caret.offset - 1, caret.offset]) {
    if (index < 0 || index >= caret.node.length) continue;
    glyph.setStart(caret.node, index);
    glyph.setEnd(caret.node, index + 1);
    if ([...glyph.getClientRects()].some((box) => coversTextLine(box, x, y, caret.node.parentElement!)))
      return { node: caret.node, index };
  }
  return null;
}
