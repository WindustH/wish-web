import assert from 'node:assert/strict';
import test from 'node:test';
import { entryView } from '../src/core/api/projections.ts';
import { groupEntries } from '../src/features/chat/grouping.ts';

function note(seq: number, title: string, text: string) {
  return entryView({ record: { sequence: seq, recorded_at: 0 }, content: { kind: 'event', value: {
    Application: { type: 'model_instruction', instruction: { title, content: [{ Text: { text } }] } },
  } } }, 'fixture');
}
test('old repeated request observations are folded while changed definitions and real instructions remain', () => {
  const entries = [
    note(1, '可用工具定义', '["shell"]'),
    note(2, '图片输入说明', '[Image sha256:a]'),
    note(3, '可用工具定义', '["shell"]'),
    note(4, '图片输入说明', '[Image sha256:a]'),
    note(5, '图片输入说明', '[Image sha256:b]'),
    note(6, '可用工具定义', '["shell","view_image"]'),
    note(7, '可用工具定义', '["shell"]'),
  ];
  const before = JSON.stringify(entries);
  const grouped = groupEntries(entries);
  assert.deepEqual(grouped.flatMap(item => item.type === 'entry' ? [item.entry.seq] : []), [1, 2, 5, 6, 7]);
  assert.equal(JSON.stringify(entries), before);
  const actual = entries.slice(0, 1).map(entry => ({ ...entry, payload: { ...entry.payload, instruction_observation: false } }));
  assert.equal(groupEntries([...actual, { ...actual[0], seq: 7 }]).length, 2);
});

test('explicit context deltas retain removal and reintroduction of the same instruction', () => {
  const entries = ['set', 'remove', 'set'].map((operation, index) => {
    const entry = note(index + 1, '图片输入说明', '[Image sha256:a]');
    entry.payload.instruction_key = '[Image sha256:a';
    entry.payload.instruction_operation = operation as 'set' | 'remove';
    return entry;
  });
  assert.deepEqual(groupEntries(entries).flatMap(item => item.type === 'entry' ? [item.entry.seq] : []), [1, 2, 3]);
});
