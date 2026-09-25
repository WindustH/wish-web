// Conversation grouping — a PURE transform: frozen inputs in, render items
// out; canonical entries are never annotated or mutated. Content order is
// sacred: text segments emit at their exact position; consecutive process
// blocks (reasoning/tool_call) accumulate into ONE thumbnail — including a
// still-pending call whose result has not arrived; process-only entries
// produce no empty body item; every item carries a stable key derived from
// source identity so prepending older history never re-keys existing items.

/** The fields of a history entry (EntryView) that grouping reads. */
export interface GroupEntry {
  kind: string;
  seq?: number | null;
  localId?: string | number;
  id?: string | number;
  run_id?: string | number | null;
  payload?: { content?: GroupBlock[]; usage?: unknown } | null;
}
export interface GroupBlock { type: string; text?: string }
type RunId = string | number | null;
export type ProcessStep<E extends GroupEntry = GroupEntry> =
  | { kind: 'entry'; entry: E; key: string }
  | { kind: 'block'; block: GroupBlock; fromSeq: E['seq']; key: string };
export interface ProcessItem<E extends GroupEntry = GroupEntry> { type: 'process'; key: string; steps: ProcessStep<E>[]; runId: RunId }
export interface EntryItem<E extends GroupEntry = GroupEntry> { type: 'entry'; entry: E; blocks: GroupBlock[]; key: string; usage: unknown }
export type GroupItem<E extends GroupEntry = GroupEntry> = ProcessItem<E> | EntryItem<E>;

const PROCESS_BLOCK = (b: GroupBlock) => b.type === 'reasoning' || b.type === 'tool_call';
const entryId = (e: GroupEntry) => e.seq != null ? `s${e.seq}` : `o${e.localId ?? e.id ?? Math.random()}`;

export function groupEntries<E extends GroupEntry>(entries: readonly E[]): GroupItem<E>[] {
  const items: GroupItem<E>[] = [];
  let group: ProcessItem<E> | null = null;

  const openGroup = (firstStep: ProcessStep<E>, runId: RunId | undefined) => {
    group = { type: 'process', key: firstStep.key, steps: [firstStep], runId: runId ?? null };
    return group;
  };
  const pushGroupStep = (step: ProcessStep<E>, runId: RunId | undefined) => {
    // Backend run boundaries do not interrupt visually consecutive work.
    // Only rendered conversation content below closes the group.
    if (!group) openGroup(step, runId);
    else group.steps.push(step);
  };
  const flushGroup = () => {
    if (group && group.steps.length) items.push(group);
    group = null;
  };

  for (const entry of entries) {
    if (entry.kind === 'history_event') continue;
    if (entry.kind === 'tool_result') {
      pushGroupStep({ kind: 'entry', entry, key: entryId(entry) }, entry.run_id);
      continue;
    }
    if (entry.kind === 'assistant_message') {
      const blocks: GroupBlock[] = entry.payload?.content || [];
      const id = entryId(entry);
      // Body blocks are everything that is not reasoning/tool_call — images
      // stay in the body alongside text (they are content, not process).
      // Usage (if any) belongs to the LAST body segment of its entry only —
      // earlier segments carry an explicit null so consumers can rely on the
      // key; process items never carry usage at all.
      const totalSegments = (() => {
        let n = 0, run = 0;
        for (const b of blocks) {
          if (PROCESS_BLOCK(b)) { if (run) n++; run = 0; }
          else if (b.type === 'text' && (b.text || '').trim()) run++;
          else if (b.type !== 'text') run++;     // image: part of the segment flow
        }
        if (run) n++;
        return n;
      })();
      let segment: GroupBlock[] = [];   // pending body segment for THIS entry
      let segmentOrdinal = 0;   // segments this entry has emitted so far
      const isBodyBlock = (b: GroupBlock) => b.type === 'image' || (b.type === 'text' && (b.text || '').trim());
      const emitSegment = () => {
        if (!segment.length) return;
        flushGroup();           // a group never spans a body item
        const last = segmentOrdinal === totalSegments - 1;
        items.push({
          type: 'entry', entry, blocks: segment, key: `${id}t${segmentOrdinal}`,
          usage: last ? (entry.payload?.usage ?? null) : null,
        });
        segmentOrdinal++;
        segment = [];
      };
      for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        if (PROCESS_BLOCK(b)) {
          emitSegment();        // body before this block renders first
          pushGroupStep({ kind: 'block', block: b, fromSeq: entry.seq, key: `${id}b${bi}` }, entry.run_id);
        } else if (isBodyBlock(b)) {
          segment.push(b);
        }
      }
      emitSegment();            // trailing body segment (if any)
      continue;                 // process-only entry: no body item at all
    }
    // user message / system entry — plain render, closes any open group
    flushGroup();
    items.push({ type: 'entry', entry, blocks: entry.payload?.content || [], key: `${entryId(entry)}t0`, usage: null });
  }
  flushGroup();
  return items;
}
