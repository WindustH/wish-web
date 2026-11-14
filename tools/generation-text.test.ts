import assert from 'node:assert/strict';
import test from 'node:test';
import { generationText, generationToolResult } from '../src/features/sessions/generationText.ts';
test('stored text stays literal, including Markdown and newlines', () => {
  assert.equal(
    generationText({ System: { content: [{ Text: { text: '# heading\n**literal**' } }] } }),
    '# heading\n**literal**',
  );
});
test('reasoning retains plaintext alongside display and opaque replay data', () => {
  const text = generationText({
    Reasoning: {
      plaintext: 'actual',
      display: 'summary',
      signature: 'sig',
      ciphertext: 'cipher',
      replay_item: { type: 'thought' },
    },
  });
  for (const field of ['actual', 'summary', 'sig', 'cipher', 'thought']) assert.ok(text.includes(field));
});
test('tool results preserve JSON arrays instead of treating them as message blocks', () => {
  const result = [{ data: 'a' }, 'b'];
  assert.ok(
    generationText({ ToolResult: { name: 'tool', call_id: 'call', content: result } }).endsWith(
      JSON.stringify(result, null, 2),
    ),
  );
});

test('tool result views separate execution data from the exact condensed text', () => {
  const message = {
    ToolResult: {
      content: { status: 'success', output: { stdout: 'all output', rows: [1, 2, 3] }, model_text: '3 rows\nDone.' },
    },
  };
  const before = structuredClone(message);
  const views = generationToolResult(message)!;
  assert.deepEqual(JSON.parse(views.execution), {
    status: 'success',
    output: { stdout: 'all output', rows: [1, 2, 3] },
  });
  assert.equal(views.model, '3 rows\nDone.');
  assert.equal(views.projected, true);
  assert.deepEqual(message, before);
});

test('old results, failures and empty model text retain their actual shapes', () => {
  for (const content of ['literal text', ['a', { b: 2 }], null, { status: 'success', output: 42 }]) {
    const views = generationToolResult({ ToolResult: { content } })!;
    assert.equal(views.execution, views.model);
    assert.equal(views.projected, false);
  }
  const failed = generationToolResult({
    ToolResult: { content: { status: 'failed', message: 'reason', model_text: 'Failed: reason' } },
  })!;
  assert.equal(failed.model, 'Failed: reason');
  assert.equal(JSON.parse(failed.execution).status, 'failed');
  assert.equal(generationToolResult({ ToolResult: { content: { status: 'success', model_text: '' } } })!.model, '');
  assert.equal(generationToolResult({ Assistant: { content: [] } }), null);
});

test('structured model projection keeps raw results and JSON types separate', () => {
  const raw = { status: 'success', output: { id: 'actual-id', count: 2, nested: [true, 'quoted "value"'] } };
  const model = { ...raw, output: { ...raw.output, id: '$WISH_BLOB_ID_A' } };
  const views = generationToolResult({ ToolResult: { content: { ...raw, model_value: model } } })!;
  assert.equal(views.projected, true);
  assert.deepEqual(JSON.parse(views.execution), raw);
  assert.deepEqual(JSON.parse(views.model), model);
});
