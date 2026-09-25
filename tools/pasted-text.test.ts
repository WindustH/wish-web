import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAttachPastedText, pastedTextFile } from '../src/core/pastedText.ts';

test('paste limits are exclusive and handle all newline conventions', () => {
  assert.equal(shouldAttachPastedText('字'.repeat(1024)), false);
  assert.equal(shouldAttachPastedText('字'.repeat(1025)), true);
  for (const newline of ['\n', '\r\n', '\r']) {
    assert.equal(shouldAttachPastedText(Array(128).fill('x').join(newline)), false);
    assert.equal(shouldAttachPastedText(Array(129).fill('x').join(newline)), true);
  }
  assert.equal(shouldAttachPastedText('👨‍👩‍👧‍👦'.repeat(1024)), false);
  assert.equal(shouldAttachPastedText('👨‍👩‍👧‍👦'.repeat(1025)), true);
});
test('text attachment preserves original Unicode and line endings as UTF-8', async () => {
  const text = '中文🙂\r\nsecond line\n';
  const file = pastedTextFile(text);
  const bytes = await file.read();
  assert.equal(file.kind, 'file');
  assert.equal(file.name, 'Pasted Text 1');
  assert.equal(pastedTextFile(text, 'Pasted Text 2').name, 'Pasted Text 2');
  assert.equal(file.mime, 'text/plain');
  assert.equal(file.size, bytes.byteLength);
  assert.equal(new TextDecoder().decode(bytes), text);
});

test('pasted text expands inline and is excluded from uploaded attachments', async () => {
  const { expandPastedText } = await import('../src/core/pastedText.ts');
  const token = `<paste-${'a'.repeat(64)}>`;
  const source = `原文\r\n${token}`;
  const pasted = { ...pastedTextFile(source), placeholder: token, bytes: new TextEncoder().encode(source).buffer };
  const file = { kind: 'file', name: 'notes.txt', placeholder: `<file-${'b'.repeat(64)}>` };
  const result = expandPastedText(`before${token}after${file.placeholder}`, [pasted, file]);
  assert.equal(result.text, `before${source}after${file.placeholder}`);
  assert.deepEqual(result.attachments, [file]);
});
