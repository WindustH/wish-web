// Conversation grouping — a PURE transform (round-5 + grouping-final):
// frozen inputs in, render items out; canonical entries are never annotated
// or mutated. Scanning rules, verified by external tests:
//   · content order is sacred — text SEGMENTS are emitted as entry items at
//     their exact position (an interleaved [think, text, tool, text] entry
//     yields process, entry, process, entry);
//   · consecutive process blocks (reasoning / tool_call) after a text
//     segment accumulate into ONE group — including a still-pending call
//     whose result has not arrived;
//   · an assistant entry with only process blocks produces NO empty body
//     item (no stray bubble/usage row) — its blocks simply join the group;
//   · every item carries a STABLE key derived from its source identity
//     (entry seq/local id + segment ordinal, or the first group step), so
//     prepending older history never re-keys existing items (Vlist anchors,
//     expansion state).
const PROCESS_BLOCK = (b) => b.type === 'reasoning' || b.type === 'tool_call';
const entryId = (e) => {
  if (e.seq != null) return `s${e.seq}`;
  if (e.localId) return `o${e.localId}`;
  throw new Error('history entry has no canonical seq or optimistic id');
};

export function groupEntries(entries) {
  const items = [];
  let group = null;

  const sameRun = (a, b) => a == null || b == null || a === b;
  // A group is BORN with its first step (which also names the key); later
  // steps append. Never seed-and-push the same step twice.
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
      pushGroupStep({ kind: 'entry', entry, key: `${entryId(entry)}result` }, entry.run_id);
      continue;
    }
    if (entry.kind === 'assistant_message') {
      const blocks = entry.payload?.content || [];
      const id = entryId(entry);
      let segment = [];         // pending text segment for THIS entry
      let lastBody = null;
      let segmentOrdinal = 0;   // how many text items this entry emitted
      const emitSegment = () => {
        if (!segment.length) return;
        flushGroup();           // a group never spans a text item
        lastBody = { type: 'entry', entry, blocks: segment, key: `${id}t${segmentOrdinal++}`, usage: null };
        items.push(lastBody);
        segment = [];
      };
      for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        if (PROCESS_BLOCK(b)) {
          emitSegment();        // text before this block renders first
          pushGroupStep({ kind: 'block', block: b, fromSeq: entry.seq, key: `${id}b${bi}` }, entry.run_id);
        } else if (b.type === 'image' || (b.type === 'text' && (b.text || '').trim())) {
          segment.push(b);
        }
      }
      emitSegment();            // trailing text segment (if any)
      if (lastBody) lastBody.usage = entry.payload?.usage;
      continue;                 // process-only entry: no body item at all
    }
    // user message / system entry — plain render, closes any open group
    flushGroup();
    items.push({ type: 'entry', entry, blocks: entry.payload?.content || [], key: `${entryId(entry)}t0` });
  }
  flushGroup();
  return items;
}
