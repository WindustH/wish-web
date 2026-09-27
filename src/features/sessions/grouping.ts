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
export interface GroupBlock { type: string; text?: string; id?: string; name?: string; arguments?: unknown }
type RunId = string | number | null;
export type ProcessStep<E extends GroupEntry = GroupEntry> =
  | { kind: 'entry'; entry: E; key: string }
  | { kind: 'block'; block: GroupBlock; fromSeq: E['seq']; key: string };
export interface ProcessItem<E extends GroupEntry = GroupEntry> { type: 'process'; key: string; steps: ProcessStep<E>[]; runId: RunId }
export interface EntryItem<E extends GroupEntry = GroupEntry> { type: 'entry'; entry: E; blocks: GroupBlock[]; key: string; usage: unknown }
/**
 * An `ask_user` call, shown as a card of its own rather than folded into the process: its
 * arguments, the entry holding its result once there is one, and answers that arrived after
 * a timeout as a message.
 */
export interface QuestionItem<E extends GroupEntry = GroupEntry> {
  type: 'question'; key: string; entry: E; callId: string; arguments: unknown;
  result: E | null; late: E | null;
}
export type GroupItem<E extends GroupEntry = GroupEntry> = ProcessItem<E> | EntryItem<E> | QuestionItem<E>;

const QUESTION_BLOCK = (b: GroupBlock) => b.type === 'tool_call' && b.name === 'ask_user';
const PROCESS_BLOCK = (b: GroupBlock) => b.type === 'reasoning' || (b.type === 'tool_call' && !QUESTION_BLOCK(b));
const payloadOf = (entry: GroupEntry) => (entry.payload ?? {}) as Record<string, any>;
// The result an `ask_user` call got; a failed one (a malformed form) stays in the process.
const questionResult = (entry: GroupEntry) =>
  entry.kind === 'tool_result' && payloadOf(entry).tool_name === 'ask_user' ? payloadOf(entry).tool_call_id as string : null;
const lateAnswer = (entry: GroupEntry) =>
  entry.kind === 'developer_message' && payloadOf(entry).metadata?.source === 'ask_user_answer' ? payloadOf(entry).metadata.call_id as string : null;
const failed = (entry: GroupEntry | undefined) => payloadOf(entry ?? {} as GroupEntry).result?.status === 'failed';
const entryId = (e: GroupEntry) => e.seq != null ? `s${e.seq}` : `o${e.localId ?? e.id ?? Math.random()}`;

export function groupEntries<E extends GroupEntry>(entries: readonly E[]): GroupItem<E>[] {
  const items: GroupItem<E>[] = [];
  let group: ProcessItem<E> | null = null;
  // Question cards gather their result and any late answer from wherever those entries sit.
  const results = new Map<string, E>(), answers = new Map<string, E>();
  for (const entry of entries) {
    const result = questionResult(entry), late = lateAnswer(entry);
    if (result) results.set(result, entry);
    if (late) answers.set(late, entry);
  }
  const asked = (b: GroupBlock) => QUESTION_BLOCK(b) && !failed(results.get(b.id ?? ''));

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
    // A question's result shows on its card; a late answer stays where it arrived, as a notice.
    const result = questionResult(entry);
    if (result && !failed(entry)) continue;
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
        if (asked(b)) {
          emitSegment();
          flushGroup();         // the question stands on its own between process runs
          const callId = b.id ?? '';
          items.push({ type: 'question', key: `${id}q${bi}`, entry, callId, arguments: b.arguments,
            result: results.get(callId) ?? null, late: answers.get(callId) ?? null });
        } else if (PROCESS_BLOCK(b) || QUESTION_BLOCK(b)) {
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
