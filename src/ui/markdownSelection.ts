import type { MarkdownBlock } from './markdown.ts';
import type { SourceMapping } from './markdownSourceMap.ts';
// Source and mappings live once per component, not in HTML attribute strings.
const sources = new WeakMap<Element, { source: string; blocks: Map<string, MarkdownBlock> }>();
export function registerMarkdownSource(element: Element, source: string, blocks: MarkdownBlock[]) {
  sources.set(element, { source, blocks: new Map(blocks.map((block) => [block.key, block])) });
}
function mapping(element: Element): SourceMapping | undefined {
  const block = element.closest<HTMLElement>('.markdown-block'),
    root = block?.closest('.markdown');
  return root && block
    ? sources.get(root)?.blocks.get(block.dataset.sourceKey!)?.mappings[Number(element.getAttribute('data-md'))]
    : undefined;
}
// Find the original boundary directly in parser-recorded runs. No parsing,
// text search or sequence alignment happens during selection/copy.
function boundary(element: Element, node: Node, offset: number, end: boolean): number | undefined {
  const record = mapping(element);
  if (!record) return;
  if (record.atomic) return end ? record.end : record.start;
  const prefix = element.ownerDocument.createRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(node, offset);
  let remaining = prefix.toString().length;
  const runs = record.runs ?? [];
  for (const { length, start, end: finish, atomic } of runs) {
    if (remaining < length! || (end && remaining === length!)) {
      return atomic ? (end ? finish : start) : start! + remaining;
    }
    remaining -= length!;
  }
  return runs.at(-1)?.end;
}
function selectedBlock(block: Element, range: Range, source: string): [number, number] | null | undefined {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let from = Infinity,
    to = -1;
  let whole = true,
    missing = false;
  const selectedElements = new Set<Element>();
  const leaves = new Map<Element, { startNode: Node; startOffset: number; endNode: Node; endOffset: number }>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('.code-head, annotation')) continue;
    const length = node.textContent?.length ?? 0;
    if (!range.intersectsNode(node)) {
      if (node.textContent?.trim()) whole = false;
      continue;
    }
    const a = range.startContainer === node ? range.startOffset : 0;
    const b = range.endContainer === node ? range.endOffset : length;
    if (a > 0 || b < length) whole = false;
    if (b <= a) continue;
    let element = node.parentElement?.closest('[data-md]');
    while (element && !mapping(element)?.runs && !mapping(element)?.atomic)
      element = element.parentElement?.closest('[data-md]');
    if (!element) {
      if (node.textContent?.trim()) missing = true;
      continue;
    }
    const leaf = leaves.get(element);
    if (leaf) {
      leaf.endNode = node;
      leaf.endOffset = b;
    } else leaves.set(element, { startNode: node, startOffset: a, endNode: node, endOffset: b });
    for (let parent: Element | null = element; parent && parent !== block; parent = parent.parentElement) {
      if (parent.hasAttribute('data-md')) selectedElements.add(parent);
    }
  }
  for (const [element, leaf] of leaves) {
    const start = boundary(element, leaf.startNode, leaf.startOffset, false),
      end = boundary(element, leaf.endNode, leaf.endOffset, true);
    if (start === undefined || end === undefined) {
      missing = true;
      continue;
    }
    from = Math.min(from, start);
    to = Math.max(to, end);
  }
  const base = Number((block as HTMLElement).dataset.sourceStart);
  if (whole && (to >= 0 || missing)) return [0, source.trimEnd().length];
  if (missing) return undefined;
  if (to < 0) return null;
  for (const element of selectedElements) {
    const content = element.ownerDocument.createRange();
    content.selectNodeContents(element);
    // Fully selected inline syntax includes its opening/closing delimiters.
    const intersection = content.cloneRange();
    if (range.compareBoundaryPoints(Range.START_TO_START, content) > 0)
      intersection.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, content) < 0)
      intersection.setEnd(range.endContainer, range.endOffset);
    const mapped = mapping(element);
    if (mapped && intersection.toString() === content.toString()) {
      from = Math.min(from, mapped.start);
      to = Math.max(to, mapped.end);
    }
  }
  return [from - base, to - base];
}

export function markdownSelectionPieces(range: Range, root: Element) {
  if (!root.contains(range.commonAncestorContainer)) return [];
  const pieces: { owner: Element; source: string; start: number; end: number }[] = [];
  for (const block of root.querySelectorAll<HTMLElement>('.markdown-block')) {
    if (!range.intersectsNode(block)) continue;
    const owner = block.closest('.markdown');
    const source = owner && sources.get(owner)?.source;
    if (!owner || source == null) return [];
    const start = Number(block.dataset.sourceStart),
      end = Number(block.dataset.sourceEnd);
    const local = selectedBlock(block, range, source.slice(start, end));
    if (local === null) continue;
    if (!local) return [];
    pieces.push({ owner, source, start: start + local[0], end: start + local[1] });
  }
  if (!pieces.length) return [];
  const groups: typeof pieces = [];
  for (const piece of pieces) {
    const last = groups.at(-1);
    if (last?.owner === piece.owner) last.end = piece.end;
    else groups.push({ ...piece });
  }
  return groups;
}

export function markdownSelection(range: Range, root: Element, fallback: string): string {
  const pieces = markdownSelectionPieces(range, root);
  return pieces.length ? pieces.map((p) => p.source.slice(p.start, p.end)).join('\n\n') : fallback;
}
/** Inverse parser map for highlighting a durable source interval. No text matching. */
export function markdownSourceRanges(root: Element, from: number, to: number): Range[] {
  const ranges: Range[] = [];
  for (const element of root.querySelectorAll('[data-md]')) {
    const record = mapping(element);
    if (!record || (!record.runs && !record.atomic)) continue;
    const spans: [number, number][] = [];
    let offset = 0;
    if (record.atomic) {
      if (record.start < to && record.end > from) spans.push([0, element.textContent?.length ?? 0]);
    } else
      for (const run of record.runs ?? []) {
        if (run.start < to && run.end > from)
          spans.push([
            offset + (run.atomic ? 0 : Math.max(0, from - run.start)),
            offset + (run.atomic ? run.length : Math.min(run.length, to - run.start)),
          ]);
        offset += run.length;
      }
    if (!spans.length) continue;
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: { node: Node; start: number; end: number }[] = [];
    let length = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const end = length + (node.textContent?.length ?? 0);
      nodes.push({ node, start: length, end });
      length = end;
    }
    for (const [a, b] of spans) {
      const first = nodes.find((n) => n.end > a),
        last = nodes.find((n) => n.end >= b);
      if (!first || !last || b <= a) continue;
      const range = element.ownerDocument.createRange();
      range.setStart(first.node, a - first.start);
      range.setEnd(last.node, b - last.start);
      ranges.push(range);
    }
  }
  return ranges;
}
