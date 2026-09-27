import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { approach } from '../src/features/sessions/glide.ts';
import { estimateRow } from '../src/features/sessions/rowEstimate.ts';
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
  assert.equal(Math.round(estimateRow(entry('assistant_message', '好的。') as never, 736)), 49);
  assert.equal(Math.round(estimateRow(entry('user_message', 'hi') as never, 736)), 77);
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
