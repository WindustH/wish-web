import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { approach } from '../src/features/sessions/glide.ts';
import { estimateRow } from '../src/features/sessions/rowEstimate.ts';
import { groupEntries, inlineChips } from '../src/features/sessions/grouping.ts';
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
  // On its button, an icon for each kind of thing, in the order they first came.
  assert.deepEqual(stepIcons([call('web_search', 'a'), call('shell_start', 'b'), call('shell_poll', 'c'), call('web_search', 'd')]), ['globe', 'terminal']);
  assert.deepEqual(stepIcons([{ kind: 'block', key: 'r', block: { type: 'reasoning', text: 'hmm' } }]), ['thinking']);
});
