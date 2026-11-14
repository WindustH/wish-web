import assert from 'node:assert/strict';
import test from 'node:test';
import { entryView } from '../src/core/api/projections.ts';
import { groupEntries } from '../src/domain/chat/grouping.ts';
import { i18n } from '../src/core/i18n/index.ts';
import { noticeLabel, noticeText } from '../src/features/sessions/entries/railMeta.ts';

const event = (seq: number, value: unknown) =>
  entryView(
    { record: { sequence: seq, recorded_at: 0 }, content: { kind: 'event', value: { Application: value } } },
    'fixture',
  );
const message = (seq: number, value: unknown, extra = {}) =>
  entryView(
    {
      record: { sequence: seq, recorded_at: 0 },
      content: { kind: 'message', value: { id: seq, message: value } },
      ...extra,
    },
    'fixture',
  );

test('history presentation follows locale changes without reprojecting the entry', () => {
  const previous = i18n.locale.value;
  try {
    i18n.setLocale('zh');
    const image = event(30, {type:'image_delivery', content:[{Text:{text:'Retained historical notice'}}]});
    const compact = entryView({record:{sequence:31,recorded_at:0},content:{kind:'event',value:{ContextCompacted:{removed_entries:5}}}},'fixture');
    assert.equal(noticeLabel(image), '图片发送状态');
    assert.match(noticeText(compact), /移除了 5 条/);
    i18n.setLocale('en');
    assert.equal(noticeLabel(image), 'Image delivery');
    assert.match(noticeText(compact), /5 context entries removed/);
    assert.equal(noticeText(image), 'Retained historical notice');
  } finally { i18n.setLocale(previous); }
});

test('request diagnostics retain history cursors but do not appear on the activity rail', () => {
  const entries = [undefined, 'set', 'remove', 'set'].map((operation, i) =>
    event(i + 1, {
      type: 'model_instruction',
      operation,
      instruction: {
        title: '可用工具定义',
        content: [{ Text: { text: 'Image stored at "/image". Not included: image budget exceeded.' } }],
      },
    }),
  );
  assert.deepEqual(
    entries.map((entry) => entry.seq),
    [1, 2, 3, 4],
  );
  assert.ok(entries.every((entry) => entry.kind === 'history_event'));
  assert.deepEqual(groupEntries(entries), []);
  assert.deepEqual(
    groupEntries([{ ...entries[0]!, kind: 'system_message', payload: { instruction_observation: true, content: [] } }]),
    [],
  );
});

test('real historical instructions remain unchanged without generation supplements', () => {
  const first = message(
    1,
    {
      System: {
        metadata: { source: 'wish_agent_instructions' },
        content: [{ Text: { text: 'Original instructions' } }],
      },
    },
    {
      instruction_preview: 'New instructions\n\n# Skills\nCurrent skills',
      initial_tools: [{ name: 'new_tool' }],
    },
  );
  const second = message(2, { System: { content: [{ Text: { text: 'Original instructions' } }] } });
  assert.equal(first.payload.instruction_sections?.length, 1);
  assert.equal(first.payload.instruction_sections?.[0]?.content, 'Original instructions');
  const rows = groupEntries([first, second]);
  assert.equal(rows.length, 2, 'actual repeated historical messages are not deduplicated');
  assert.ok(!JSON.stringify(rows).includes('new_tool'));
  assert.ok(!JSON.stringify(rows).includes('Current skills'));
});

test('traced commands and results remain activity history alongside reasoning', () => {
  const entries = [
    event(1, { type: 'command_tool_use', call_id: 'call', name: 'blob', arguments: { action: 'list' } }),
    event(2, { type: 'model_instruction', instruction: { title: '可用工具定义', content: [] } }),
    event(3, {
      type: 'command_tool_result',
      call_id: 'call',
      name: 'blob',
      content: { status: 'success', output: {} },
    }),
  ];
  const rows = groupEntries(entries);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.type, 'process');
  if (rows[0]?.type === 'process') assert.equal(rows[0].steps.length, 2);
});

test('compaction summaries are chronological history notices with their saved text', () => {
  const entries = [
    { CompactionSummary: { content: [{ Text: { text: 'Saved summary' } }], source_start: 1, source_end: 8 } },
    { ContextCompacted: { previous: 0, active: 1, removed_entries: 8 } },
  ].map((value, i) =>
    entryView(
      {
        record: { sequence: 10 + i, recorded_at: 100 + i },
        content: { kind: 'event', value },
      },
      'fixture',
    ),
  );
  assert.deepEqual(entries[0]!.payload.content, [{ type: 'text', text: 'Saved summary' }]);
  assert.deepEqual(
    entries.map((entry) => entry.payload.instruction_kind),
    ['summary', 'compaction'],
  );
  assert.deepEqual(
    entries.map((entry) => entry.seq),
    [10, 11],
  );
  assert.equal(groupEntries(entries).length, 2);
});

test('image delivery notices remain chronological history; context removal is not an image event', () => {
  const texts = [
    'Image read and stored at "/image".',
    'Image stored at "/image". Not included: image budget exceeded.',
    'Image stored at "/image". Not included: model does not support images.',
    'Image stored at "/image". Not included: image input rejected by upstream.',
  ];
  const entries = texts.map((text, i) =>
    event(i + 1, {
      type: 'model_instruction',
      operation: 'set',
      instruction: { title: '图片输入说明', content: [{ Text: { text } }] },
    }),
  );
  assert.deepEqual(
    entries.map((entry) => entry.payload.content),
    texts.map((text) => [{ type: 'text', text }]),
  );
  assert.equal(groupEntries(entries).length, 4);
  const removed = event(5, {
    type: 'model_instruction',
    operation: 'remove',
    instruction: { title: '图片输入说明', content: [{ Text: { text: texts[3] } }] },
  });
  assert.equal(groupEntries([...entries, removed]).length, 4);
});

test('image delivery events show their saved explanation without generation reconstruction', () => {
  const text = 'Image stored at "/image". Not included: image budget exceeded.';
  const entry = event(42, {
    type: 'image_delivery',
    path: '/image',
    reason: 'image budget exceeded',
    content: [{ Text: { text } }],
  });
  assert.equal(entry.kind, 'system_message');
  assert.deepEqual(entry.payload.content, [{ type: 'text', text }]);
  assert.equal(groupEntries([entry]).length, 1);
});

test('compaction summaries tolerate non-text and malformed historical blocks', () => {
  for (const content of [null, {}, [null, {}, { ImageRef: { blob_id: 'image' } }, { Text: { text: 123 } }]]) {
    const entry = entryView({ record: { sequence: 1, recorded_at: 0 }, content: { kind: 'event', value: { CompactionSummary: { content } } } }, 'fixture');
    assert.deepEqual(entry.payload.content, []);
  }
  const entry = entryView({ record: { sequence: 1, recorded_at: 0 }, content: { kind: 'event', value: { CompactionSummary: { content: [{ Text: { text: 'summary' } }, null] } } } }, 'fixture');
  assert.deepEqual(entry.payload.content, [{ type: 'text', text: 'summary' }]);
});
