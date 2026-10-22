// Where the activity rail's nodes sit: a pure placing of events along the conversation's own
// height. Each row keeps its measured (or estimated) height and the events that came with it; a
// tall message shows more of them along its side, a short one folds them into a count, and nodes
// that would crowd each other merge until they are a finger apart. Nothing here touches the DOM
// or the log's layout - the rail floats beside it, so no row is ever taller for its events.
export const RAIL_PITCH = 27;   // a node's 24px plus its 3px of air
const MIN_GAP = 26;             // two nodes never stand closer than this
const TOP_PAD = 4;              // the first node's air below its row's top

/** One thing that happened: a step of a run (with its step key), or a notice (stepKey null). */
export interface RailEvent { chipKey: string; stepKey: string | null; icon: string; failed: boolean; warn: boolean; tip: string; seq?: number }
/** A conversation row as the rail sees it: where it starts, how tall it is, what happened in it. */
export interface RailRow { top: number; height: number; events: RailEvent[] }
/** A placed node: one event when `event` is set, or a gathered count of several. */
export interface RailNode {
  y: number; icon: string; count: number; failed: boolean; warn: boolean; tip: string; seq?: number;
  event: RailEvent | null; events: RailEvent[];
}

const node = (event: RailEvent, y: number): RailNode =>
  ({ y, icon: event.icon, count: 1, failed: event.failed, warn: event.warn, tip: event.tip, seq: event.seq, event, events: [event] });

/** A row's slots: how many nodes fit along its height, at least one whatever the height. */
export const rowSlots = (height: number): number => Math.max(1, Math.floor((height - 8) / RAIL_PITCH));

/** The events of one row as nodes: as many as fit down its height, the rest gathered into one. */
function rowNodes(row: RailRow): RailNode[] {
  const events = row.events;
  if (!events.length) return [];
  const slots = rowSlots(row.height);
  if (events.length <= slots) return events.map((event, i) => node(event, row.top + TOP_PAD + i * RAIL_PITCH + RAIL_PITCH / 2));
  const shown = events.slice(0, Math.max(1, slots - 1));
  const rest = events.slice(shown.length);
  const placed = shown.map((event, i) => node(event, row.top + TOP_PAD + i * RAIL_PITCH + RAIL_PITCH / 2));
  const gathered = rest.slice(1).reduce<RailNode>((into, event) => {
    into.count += 1;
    into.failed = into.failed || event.failed;
    into.warn = into.warn || event.warn;
    into.events.push(event);
    return into;
  }, node(rest[0]!, row.top + TOP_PAD + shown.length * RAIL_PITCH + RAIL_PITCH / 2));
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
export function layoutRail(rows: readonly RailRow[]): { nodes: RailNode[]; line: { top: number; bottom: number } | null } {
  const nodes = thinOut(rows.flatMap(rowNodes).sort((a, b) => a.y - b.y));
  const first = nodes[0], last = nodes.at(-1);
  return { nodes, line: first && last && nodes.length ? { top: first.y, bottom: last.y } : null };
}
