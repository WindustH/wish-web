import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { approach } from '../src/features/sessions/glide.ts';
import { estimateRow } from '../src/features/sessions/rowEstimate.ts';
import { groupEntries, inlineChips } from '../src/features/sessions/grouping.ts';
import { layoutRail, RAIL_PITCH, rowSlots, type RailEvent, type RailRow } from '../src/features/sessions/railLayout.ts';
import { stepIcons, summarizeSteps } from '../src/features/sessions/entries/processDetails.ts';
import { useFreshRows } from '../src/features/sessions/useFreshRows.ts';

test('the glide closes on its target, slowing down, and lands exactly', () => {
  let position = 0;
  const steps = [];
  for (let i = 0; i < 60 && position !== 1000; i++) {
    const next = approach(position, 1000, 16);
    steps.push(next - position);
    position = next;
  }
  assert.equal(position, 1000);
  assert.ok(steps[0]! > steps[1]! && steps[1]! > steps[2]!, 'each frame covers less ground');
});

test('rows are guessed from what they hold', () => {
  const entry = (kind: string, text: string) => ({ type: 'entry', key: 'k', usage: null, entry: { kind }, blocks: [{ type: 'text', text }] });
  assert.equal(Math.round(estimateRow(entry('assistant_message', '好的。') as never, 736)), 48);
  assert.equal(Math.round(estimateRow(entry('user_message', 'hi') as never, 736)), 76);
  assert.equal(estimateRow({ type: 'process' }, 334), 62);
  assert.equal(estimateRow({ type: 'process' }, 736), 53);
  const long = '这是一段比较长的中文回复，'.repeat(20);
  assert.ok(estimateRow(entry('assistant_message', long) as never, 334) > estimateRow(entry('assistant_message', long) as never, 736),
    'a narrow column wraps into more lines');
});

test('only rows added at the end enter, and a reply that streamed does not', async () => {
  type Row = { key: string; kind: string };
  const rows = ref<Row[]>([]);
  const session = ref('a');
  const scope = effectScope();
  const fresh = scope.run(() => useFreshRows(rows, session, () => true, row => row.kind !== 'assistant'))!;
  try {
    rows.value = [{ key: 's1', kind: 'user' }, { key: 's2', kind: 'assistant' }];
    await nextTick();
    assert.equal(fresh.value.size, 0, 'the first load stays still');
    rows.value = [{ key: 's0', kind: 'user' }, ...rows.value];
    await nextTick();
    assert.equal(fresh.value.size, 0, 'older history added above stays still');
    rows.value = [...rows.value, { key: 's3', kind: 'user' }, { key: 's4', kind: 'assistant' }];
    await nextTick();
    assert.deepEqual([...fresh.value], ['s3']);
    session.value = 'b';
    rows.value = [{ key: 'b1', kind: 'user' }];
    await nextTick();
    assert.equal(fresh.value.size, 0, 'another session starts over');
  } finally { scope.stop(); }
});

test('steps and notices sit at the start of the reply after them, and a row only with none after', () => {
  const user = (seq: number, text: string) => ({ kind: 'user_message', seq, payload: { content: [{ type: 'text', text }] } });
  const say = (seq: number, text: string, calls = true) => ({ kind: 'assistant_message', seq,
    payload: { content: [...(text ? [{ type: 'text', text }] : []), ...(calls ? [{ type: 'tool_call', id: `c${seq}`, name: 'shell_start' }] : [])] } });
  const result = (seq: number) => ({ kind: 'tool_result', seq, payload: { tool_call_id: `c${seq - 1}` } });
  const notice = (seq: number) => ({ kind: 'system_message', seq, payload: { content: [{ type: 'text', text: 'note' }] } });
  const shape = (entries: unknown[]) => inlineChips(groupEntries(entries as never)).map(row => {
    if (row.type === 'chips') return `[${row.chips.map(chip => chip.type).join(' ')}]`;
    const before = (row as { before?: { type: string }[] }).before;
    return `${before ? `[${before.map(chip => chip.type).join(' ')}]` : ''}${row.type === 'entry' ? (row.entry.kind === 'assistant_message' ? 'reply' : 'user') : row.type}`;
  });

  // Each run goes before the reply after it, the one called at a reply's end too.
  assert.deepEqual(shape([user(1, 'go'), say(2, ''), result(3), say(4, '我先看看。'), result(5), notice(6), say(7, '完成。', false)]),
    ['user', '[process]reply', '[process entry]reply']);
  // Steps with no reply after them in their turn make a row of their own.
  assert.deepEqual(shape([user(1, 'go'), say(2, '看看。'), result(3), user(4, 'stop')]), ['user', 'reply', '[process]', 'user']);
});

test('a run of steps is said in a line of what it did', () => {
  const call = (name: string, id: string) => ({ kind: 'block', key: id, block: { type: 'tool_call', id, name } });
  assert.equal(summarizeSteps([call('shell_start', 'a'), call('shell_poll', 'b'), call('shell_start', 'c'), call('web_search', 'd')], true),
    '运行了 2 条命令、搜索了网页');
  assert.equal(summarizeSteps([call('web_search', 'a'), call('web_search', 'b'), call('context7', 'c')], false), 'Searched the web 2 times, used context7');
  assert.equal(summarizeSteps([{ kind: 'block', key: 'r', block: { type: 'reasoning', text: 'hmm' } }], true), '思考了一会儿');
  // A run that only checks on a command says so; a result whose call came earlier counts as its tool.
  assert.equal(summarizeSteps([call('shell_poll', 'a'), call('shell_poll', 'b')], true), '查看了命令输出');
  const result = { kind: 'entry', key: 'e', entry: { kind: 'tool_result', seq: 9, payload: { tool_call_id: 'x', tool_name: 'web_search' } } };
  assert.equal(summarizeSteps([result], false), 'Searched the web');
  assert.deepEqual(stepIcons([result]), ['globe']);
  // On its button, an icon for each kind of thing, in the order they first came.
  assert.deepEqual(stepIcons([call('web_search', 'a'), call('shell_start', 'b'), call('shell_poll', 'c'), call('web_search', 'd')]), ['globe', 'terminal']);
  assert.deepEqual(stepIcons([{ kind: 'block', key: 'r', block: { type: 'reasoning', text: 'hmm' } }]), ['thinking']);
});

test('a row is never taller or narrower for the events it carries', () => {
  const reply = (text: string) => ({ type: 'entry', key: 'k', usage: null, entry: { kind: 'assistant_message' }, blocks: [{ type: 'text', text }] });
  const long = '好'.repeat(43);
  // The rail floats in the margin: the words keep the whole column, whatever came before them.
  assert.equal(Math.round(estimateRow(reply('好的。') as never, 736)), 48);
  assert.equal(estimateRow(reply(long) as never, 400), estimateRow(reply(long) as never, 400));
  // A process-only row is an unseen host: no height at all.
  assert.equal(estimateRow({ type: 'chips', key: 'c', chips: [] } as never, 736), 0);
});

test('a tall message spreads its events along its height, a short one folds them', () => {
  const events = (n: number): RailEvent[] => Array.from({ length: n }, (_, i) =>
    ({ chipKey: 'p', stepKey: `s${i}`, icon: 'terminal', failed: false, warn: false, tip: `#${i}`, seq: i + 1 }));
  // A 150px row fits five slots: six events show five nodes and gather the last into a count.
  assert.equal(rowSlots(150), 5);
  const tall = layoutRail([{ top: 0, height: 150, events: events(6) }]);
  assert.equal(tall.nodes.length, 5);
  assert.equal(tall.nodes.at(-1)!.count, 2);
  // Down the row's height, one pitch apart, starting half a pitch in.
  assert.ok(Math.abs(tall.nodes[1]!.y - tall.nodes[0]!.y - RAIL_PITCH) < 0.01);
  assert.ok(Math.abs(tall.nodes[0]!.y - (4 + RAIL_PITCH / 2)) < 0.01);
  // A one-line row fits one: everything but the first gathers into a single count node.
  assert.equal(rowSlots(30), 1);
  const short = layoutRail([{ top: 0, height: 30, events: events(3) }]);
  assert.equal(short.nodes.length, 2);
  assert.equal(short.nodes[0]!.count, 1);
  assert.equal(short.nodes.at(-1)!.count, 2);
});

test('nodes that would crowd merge into one, and stay merged', () => {
  const event = (seq: number): RailEvent => ({ chipKey: 'p', stepKey: `s${seq}`, icon: 'terminal', failed: seq === 3, warn: false, tip: `#${seq}`, seq });
  // Three unseen host rows 10px apart, one event each: a single gathered node of three, standing
  // at their weighted middle, coloured by the worst that happened among them.
  const rows: RailRow[] = [0, 10, 20].map(top => ({ top, height: 0, events: [event(top / 10 + 1)] }));
  const merged = layoutRail(rows);
  assert.equal(merged.nodes.length, 1);
  assert.equal(merged.nodes[0]!.count, 3);
  assert.ok(Math.abs(merged.nodes[0]!.y - 27.5) < 0.01, 'the weighted middle of the three');
  assert.ok(merged.nodes[0]!.failed, 'a failure anywhere colours the gathered node');
  assert.ok(merged.nodes[0]!.events.length === 3, 'what it gathers stays reachable behind it');
  // Whatever the input, no two placed nodes stand closer than 26px.
  const crowded: RailRow[] = Array.from({ length: 8 }, (_, i) => ({ top: i * 10, height: 0, events: [event(i + 1)] }));
  const thin = layoutRail(crowded).nodes;
  for (let i = 1; i < thin.length; i++) assert.ok(thin[i]!.y - thin[i - 1]!.y >= 26, `gap ${thin[i]!.y - thin[i - 1]!.y}`);
});

test('the line runs from the first event to the last, across user messages', () => {
  const event = (seq: number): RailEvent => ({ chipKey: 'p', stepKey: `s${seq}`, icon: 'terminal', failed: false, warn: false, tip: `#${seq}`, seq });
  // A user row sits between two rows of events, tall enough that nothing merges.
  const rows: RailRow[] = [
    { top: 0, height: 120, events: [event(1), event(2)] },
    { top: 120, height: 90, events: [] },          // the user's words: nothing of the rail's
    { top: 210, height: 120, events: [event(3)] },
  ];
  const { nodes, line } = layoutRail(rows);
  assert.equal(nodes.length, 3);
  // The line spans the whole conversation's activity, not the turn's; it is never broken by a row.
  assert.ok(line);
  assert.ok(Math.abs(line!.top - nodes[0]!.y) < 0.01);
  assert.ok(Math.abs(line!.bottom - nodes.at(-1)!.y) < 0.01);
  assert.ok(line!.bottom > 210, 'the line crosses the user message below it');
});
