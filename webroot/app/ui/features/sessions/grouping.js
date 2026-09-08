// Conversation grouping — a PURE transform (round-5): entries in, render
// items out; canonical entries are never annotated or mutated, so history
// windows can be regrouped freely. Order rules:
//   · text blocks render as entry items at their position;
//   · reasoning / tool_call / tool_result blocks form process groups in
//     content order — a group closes when a text item is emitted and a new
//     one opens for process blocks that follow;
//   · a trailing tool call whose result has not arrived yet still forms a
//     process group immediately (the result joins later) — never falls back
//     to scattered chips.
// Nothing is hidden via CSS; no block is dropped or duplicated.
const PROCESS_BLOCK = (b) => b.type === 'reasoning' || b.type === 'tool_call';

export function groupEntries(entries) {
  const items = [];
  let group = null;
  let groupSeq = 0;

  const openGroup = () => {
    group ||= { type: 'process', key: `proc-${++groupSeq}`, steps: [] };
    return group;
  };
  const flushGroup = () => {
    if (group && group.steps.length) items.push(group);
    group = null;
  };
  const sameRun = (a, b) => a == null || b == null || a === b;

  for (const entry of entries) {
    if (entry.kind === 'tool_result') {
      if (group && !sameRun(group.runId, entry.run_id)) flushGroup();
      openGroup().runId ??= entry.run_id;
      openGroup().steps.push({ kind: 'entry', entry });
      continue;
    }
    if (entry.kind === 'assistant_message') {
      const blocks = entry.payload?.content || [];
      // split this entry's blocks into ordered segments; text becomes the
      // entry's render payload, process blocks join groups around it
      const texts = [];
      let sawText = false;
      for (const b of blocks) {
        if (PROCESS_BLOCK(b)) {
          if (sawText) flushGroup();          // process after text → new group
          if (group && !sameRun(group.runId, entry.run_id)) flushGroup();
          openGroup().runId ??= entry.run_id;
          openGroup().steps.push({ kind: 'block', block: b, fromSeq: entry.seq });
        } else if (b.type === 'text' && (b.text || '').trim()) {
          sawText = true;
          flushGroup();                        // group never spans a text item
          texts.push(b);
        }
      }
      items.push({ type: 'entry', entry, blocks: texts });
      continue;
    }
    // user message / system entry: plain render, closes any open group
    flushGroup();
    items.push({ type: 'entry', entry, blocks: entry.payload?.content || [] });
  }
  flushGroup();
  return items;
}
