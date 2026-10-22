// Where the activity rail's nodes sit: a pure placing of events along the conversation's own
// height. Each row keeps its measured (or estimated) height and the events that came with it; a
// tall message shows more of them along its side, a short one folds them into a count, and nodes
// that would crowd each other merge until they are a finger apart. Nothing here touches the DOM
// or the log's layout - the rail floats beside it, so no row is ever taller for its events.
export const RAIL_PITCH = 27;   // a node's 24px plus its 3px of air
const MIN_GAP = 26;             // two nodes never stand closer than this
const TOP_PAD = 4;              // the first node's air below its row's top
const NODE_BOTTOM = 16;         // half a 24px node, plus its badge below

/** One thing that happened: a step of a run (with its step key), or a notice (stepKey null).
 *  `step` and `preview` ride along for the window a gathered node opens; the placing here never
 *  reads them. */
export interface RailEvent {
  chipKey: string; stepKey: string | null; icon: string; failed: boolean; warn: boolean; tip: string; seq?: number;
  step?: any; preview?: string;
}
/** A conversation row as the rail sees it: where it starts, how tall it is, what happened in it. */
export interface RailRow { top: number; height: number; events: RailEvent[] }
/** A placed node: one event when `event` is set, or a gathered count of several. */
export interface RailNode {
  y: number; icon: string; count: number; failed: boolean; warn: boolean; tip: string; seq?: number;
  event: RailEvent | null; events: RailEvent[];
}

const node = (event: RailEvent, y: number): RailNode =>
  ({ y, icon: event.icon, count: 1, failed: event.failed, warn: event.warn, tip: event.tip, seq: event.seq, event, events: [event] });

/** A row's slots: how many nodes fit between its top and the next event's first ideal place,
 *  at least one wherever it is. A short message over open rail below spreads down it; only when
 *  the next event stands close does the row fold what cannot fit into a count. */
export const rowSlots = (rowTop: number, nextIdealY = Infinity): number =>
  Math.max(1, Math.floor((nextIdealY - rowTop - 8) / RAIL_PITCH));

/** The events of one row as nodes: as many as the open rail before the next event takes, the
 *  rest gathered into one count node. */
function rowNodes(row: RailRow, nextIdealY: number, bottom: number): RailNode[] {
  const events = row.events;
  if (!events.length) return [];
  // A trailing process host has zero height and starts at the transcript's end. Keep its
  // node inside that end, rather than letting absolute-positioned children extend scrollHeight.
  const lastY = Math.max(TOP_PAD + RAIL_PITCH / 2, bottom - NODE_BOTTOM);
  const firstY = Math.min(row.top + TOP_PAD + RAIL_PITCH / 2, lastY);
  const slots = Math.min(rowSlots(row.top, nextIdealY), Math.floor((lastY - firstY) / RAIL_PITCH) + 1);
  if (events.length <= slots) return events.map((event, i) => node(event, firstY + i * RAIL_PITCH));
  // With one slot all events belong in the gathered node; showing one separately would
  // create a second node outside the available space.
  const shown = events.slice(0, slots - 1);
  const rest = events.slice(shown.length);
  const placed = shown.map((event, i) => node(event, firstY + i * RAIL_PITCH));
  const gathered = rest.slice(1).reduce<RailNode>((into, event) => {
    into.count += 1;
    into.failed = into.failed || event.failed;
    into.warn = into.warn || event.warn;
    into.events.push(event);
    return into;
  }, node(rest[0]!, firstY + shown.length * RAIL_PITCH));
  return [...placed, gathered];
}

/** Nodes that would crowd merge into one: the first's face, the counts summed, the worst that
 *  happened kept, standing at the group's weighted middle. Repeated until no two stand close. */
function thinOut(nodes: RailNode[]): RailNode[] {
  let current = nodes;
  let merged = true;
  while (merged) {
    merged = false;
    const out: RailNode[] = [];
    for (const next of current) {
      const last = out.at(-1);
      if (last && next.y - last.y < MIN_GAP) {
        const weight = last.count + next.count;
        last.y = (last.y * last.count + next.y * next.count) / weight;
        last.count = weight;
        last.failed = last.failed || next.failed;
        last.warn = last.warn || next.warn;
        last.event = null;
        last.events.push(...next.events);
        merged = true;
      } else out.push({ ...next, events: [...next.events] });
    }
    current = out;
  }
  return current;
}

/**
 * The whole rail: every row's events as nodes along the conversation's height, thinned so no two
 * crowd, and the one line that runs from the first of them to the last - through user messages
 * and replies alike, never broken by a turn.
 */
export function layoutRail(rows: readonly RailRow[], total = rows.reduce((end, row) => Math.max(end, row.top + row.height), 0)): { nodes: RailNode[]; line: { top: number; bottom: number } | null } {
  // The first ideal place of every row that holds events: where its first node would stand.
  const nextIdeals = rows.filter(row => row.events.length).map(row => row.top + TOP_PAD + RAIL_PITCH / 2);
  let next = 0;
  const nodes = thinOut(rows.flatMap(row => {
    if (!row.events.length) return [];
    // Even the final run is bounded by the content. Infinity here used to spread every
    // remaining activity below the text, enlarging the scroll range beyond the virtual list.
    const nextIdealY = nextIdeals[next + 1] ?? Infinity;
    next++;
    return rowNodes(row, nextIdealY, total);
  }).sort((a, b) => a.y - b.y));
  const first = nodes[0], last = nodes.at(-1);
  return { nodes, line: first && last && nodes.length ? { top: first.y, bottom: last.y } : null };
}
