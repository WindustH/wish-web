// A first guess at a conversation row's height, before the row is rendered
// and measured. Rows above the view are corrected as they are measured, and
// each correction shifts the scroll position; close guesses keep those shifts
// small, so scrolling up through history stays steady. The numbers come from
// measuring real conversations at desktop and phone widths.
import type { GroupBlock, GroupItem } from './grouping.ts';

const LINE = 28.8;          // message text: 16px at line-height 1.8
const PARAGRAPH = 18;       // what each further source line adds in rendered Markdown (margins, lists, headings)
const WIDE = 16;            // a CJK or full-width character at message size
const NARROW = 8.6;         // the average of everything else
const WRAP = 1.06;          // room lost to breaking at word boundaries
const MAX_LINES = 400;

const wide = /[　-鿿가-힯＀-￯]/g;

/** Wrapped lines and source lines of some text set `width` pixels wide. */
function textLines(text: string, width: number): { wrapped: number; source: number } {
  let wrapped = 0, source = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const wideCount = line.match(wide)?.length ?? 0;
    const pixels = (wideCount * WIDE + (line.length - wideCount) * NARROW) * WRAP;
    wrapped += Math.max(1, Math.ceil(pixels / Math.max(width, 120)));
    if (++source >= MAX_LINES) break;
  }
  return { wrapped: Math.min(wrapped, MAX_LINES * 4), source };
}

const textOf = (blocks: readonly GroupBlock[]) => blocks.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n');
const count = (blocks: readonly GroupBlock[], type: string) => blocks.filter(block => block.type === type).length;

/** `width` is the conversation column's; below 600px the phone layout's sizes apply. */
export function estimateRow(row: GroupItem | { type: string }, width: number): number {
  const compact = width < 600;
  if (row.type === 'process') return compact ? 62 : 53;
  if (row.type === 'question') {
    const questions = ((row as { arguments?: { questions?: unknown[] } }).arguments?.questions?.length) ?? 1;
    return 110 + 80 * questions;
  }
  if (row.type !== 'entry') return 110;
  const { entry, blocks } = row as Extract<GroupItem, { type: 'entry' }>;
  const media = count(blocks, 'image') * 220 + count(blocks, 'file') * 44;
  if (entry.kind === 'assistant_message') {
    const { wrapped, source } = textLines(textOf(blocks), width);
    return 20 + LINE * wrapped + PARAGRAPH * Math.max(0, source - 1) + media;
  }
  if (entry.kind === 'user_message') {
    // The bubble: at most 92% of the column, 16px padding each side, 12px above and below.
    const { wrapped } = textLines(textOf(blocks), width * 0.92 - 32);
    return 48 + LINE * Math.max(1, wrapped) + media;
  }
  return compact ? 62 : 53;
}
