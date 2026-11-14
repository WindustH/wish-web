/** Map syntax-highlighted text back to exact UTF-16 source offsets, excluding the line-number gutter. */
export function sourceSelection(root: HTMLElement, text: string, range: Range) {
  if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  const end = start + range.toString().length;
  if (text.slice(start, end) !== range.toString()) return;
  return {
    start,
    end,
    text: text.slice(start, end),
    lineStart: text.slice(0, start).split(/\r\n?|\n/).length,
    lineEnd: text
      .slice(0, end)
      .replace(/(?:\r\n?|\n)$/, '')
      .split(/\r\n?|\n/).length,
  };
}

export function sourceRange(root: HTMLElement, start: number, end: number): Range | undefined {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0,
    began = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!began && start <= offset + length) {
      range.setStart(node, Math.max(0, start - offset));
      began = true;
    }
    if (began && end <= offset + length) {
      range.setEnd(node, Math.max(0, end - offset));
      return range;
    }
    offset += length;
  }
}
