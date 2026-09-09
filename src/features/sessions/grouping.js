// Conversation grouping — a PURE transform: frozen inputs in, render items
// out; canonical entries are never annotated or mutated. Content order is
// sacred: text segments emit at their exact position; consecutive process
// blocks (reasoning/tool_call) accumulate into ONE thumbnail — including a
// still-pending call whose result has not arrived; process-only entries
// produce no empty body item; every item carries a stable key derived from
// source identity so prepending older history never re-keys existing items.
const PROCESS_BLOCK = (b) => b.type === 'reasoning' || b.type === 'tool_call';
const entryId = (e) => e.seq != null ? `s${e.seq}` : `o${e.localId ?? e.id ?? Math.random()}`;

export function groupEntries(entries) {
  const items = [];
  let group = null;

  const sameRun = (a, b) => a == null || b == null || a === b;
  const openGroup = (firstStep, runId) => {
    group = { type: 'process', key: firstStep.key, steps: [firstStep], runId: runId ?? null };
    return group;
  };
  const pushGroupStep = (step, runId) => {
    if (group && !sameRun(group.runId, runId)) flushGroup();
    if (!group) openGroup(step, runId);
    else group.steps.push(step);
  };
  const flushGroup = () => {
    if (group && group.steps.length) items.push(group);
    group = null;
  };

  for (const entry of entries) {
    if (entry.kind === 'tool_result') {
      pushGroupStep({ kind: 'entry', entry }, entry.run_id);
      continue;
    }
    if (entry.kind === 'assistant_message') {
      const blocks = entry.payload?.content || [];
      const id = entryId(entry);
      let segment = [];         // pending text segment for THIS entry
      let segmentOrdinal = 0;   // how many text items this entry emitted
      const emitSegment = () => {
        if (!segment.length) return;
        flushGroup();           // a group never spans a text item
        items.push({ type: 'entry', entry, blocks: segment, key: `${id}t${segmentOrdinal++}` });
        segment = [];
      };
      for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        if (PROCESS_BLOCK(b)) {
          emitSegment();        // text before this block renders first
          pushGroupStep({ kind: 'block', block: b, fromSeq: entry.seq, key: `${id}b${bi}` }, entry.run_id);
        } else if (b.type === 'text' && (b.text || '').trim()) {
          segment.push(b);
        }
      }
      emitSegment();            // trailing text segment (if any)
      continue;                 // process-only entry: no body item at all
    }
    // user message / system entry — plain render, closes any open group
    flushGroup();
    items.push({ type: 'entry', entry, blocks: entry.payload?.content || [], key: `${entryId(entry)}t0` });
  }
  flushGroup();
  return items;
}
