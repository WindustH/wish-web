// A first guess at a conversation row's height, before the row is rendered
// and measured. Rows above the view are corrected as they are measured, and
// each correction shifts the scroll position; close guesses keep those shifts
// small, so scrolling up through history stays steady. The numbers come from
// measuring real conversations at desktop and phone widths.
import type { ChipItem, GroupBlock, GroupItem } from './grouping.ts';

const LINE = 28.05;        // message text: 17px at line-height 1.65
const PARAGRAPH = 18;       // what each further source line adds in rendered Markdown (margins, lists, headings)
const WIDE = 17;            // a CJK or full-width character at message size
const NARROW = 9.1;         // the average of everything else
const WRAP = 1.06;          // room lost to breaking at word boundaries
const MAX_LINES = 400;

// The activity rail down the left of a reply (features.css): 24px icons stacked with 3px between
// them, in a 24px column, 14px clear of the words.
const RAIL_NODE = 24;
const RAIL_GAP = 3;
const RAIL_WIDTH = 24;
const RAIL_COLUMN = 14;
// A run shows four icons at most; past that one more icon counts what is left ("+3").
const RAIL_SHOWN = 4;
// A row of chips with no reply beside it keeps its own bottom padding.
const CHIP_ROW_PAD = 18;

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

// The icons a run of steps puts on the rail: one per thing it did, in order; a result rides the
// call it answers and takes none of its own, while one whose call came in an earlier run stands.
function runNodes(steps: readonly any[]): number {
  const called = new Set(steps.filter(step => step.block?.type === 'tool_call').map(step => step.block.id));
  const events = steps.filter(step => step.kind !== 'entry' || !called.has(step.entry?.payload?.tool_call_id)).length;
  return events > RAIL_SHOWN ? RAIL_SHOWN + 1 : events;
}
/** The icons a chip puts on the rail: a notice is one; a run folds past four. */
function chipNodes(chip: ChipItem): number {
  return chip.type === 'process' ? runNodes(chip.steps ?? []) : 1;
}
/** How tall the rail is for a row's chips, or 0 when the row has none. */
function railHeight(chips: readonly ChipItem[] | undefined): number {
  const nodes = (chips ?? []).reduce((sum, chip) => sum + chipNodes(chip), 0);
  return nodes ? nodes * RAIL_NODE + (nodes - 1) * RAIL_GAP : 0;
}

/** `width` is the conversation column's; below 600px the phone layout's sizes apply. */
export function estimateRow(row: GroupItem | { type: string }, width: number): number {
  const compact = width < 600;
  if (row.type === 'process') return compact ? 62 : 53;
  // A row of icons with no reply to sit beside: as tall as its rail.
  if (row.type === 'chips') {
    const rail = railHeight((row as { chips?: ChipItem[] }).chips);
    return rail ? rail + CHIP_ROW_PAD : (compact ? 50 : 42);
  }
  if (row.type === 'question') {
    const questions = ((row as { arguments?: { questions?: unknown[] } }).arguments?.questions?.length) ?? 1;
    return 110 + 80 * questions;
  }
  if (row.type !== 'entry') return 110;
  const { entry, blocks } = row as Extract<GroupItem, { type: 'entry' }>;
  const media = count(blocks, 'image') * 220 + count(blocks, 'file') * 44;
  if (entry.kind === 'assistant_message') {
    const text = textOf(blocks);
    const rail = railHeight((row as { before?: ChipItem[] }).before);
    // The rail takes a column of its own: the words wrap in what is left of the width.
    const { wrapped, source } = textLines(text, rail ? width - RAIL_WIDTH - RAIL_COLUMN : width);
    const body = LINE * wrapped + PARAGRAPH * Math.max(0, source - 1) + media;
    // As tall as the taller of the two: the words, or the icons that came before them.
    return 20 + Math.max(body, rail);
  }
  if (entry.kind === 'user_message') {
    // The bubble: at most 92% of the column, 16px padding each side, 12px above and below.
    const { wrapped } = textLines(textOf(blocks), width * 0.92 - 32);
    return 48 + LINE * Math.max(1, wrapped) + media;
  }
  return compact ? 62 : 53;
}
