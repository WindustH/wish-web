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
  ];
  const before = JSON.stringify(entries);
  const grouped = groupEntries(entries);
  assert.deepEqual(grouped.flatMap(item => item.type === 'entry' ? [item.entry.seq] : []), [1, 2, 5, 6]);
  assert.equal(JSON.stringify(entries), before);
  const actual = entries.slice(0, 1).map(entry => ({ ...entry, payload: { ...entry.payload, instruction_observation: false } }));
  assert.equal(groupEntries([...actual, { ...actual[0], seq: 7 }]).length, 2);
});
