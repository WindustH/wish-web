import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFileMention, blobMentionHref, readBlobMention } from '../src/core/blobMentions.ts';
import { rowBlobMentions } from '../src/features/sessions/rowBlobMentions.ts';

test('Wish references round-trip with exact PDF page and fractional video time', () => {
  const file = { owner: 's', id: 'a'.repeat(64), page: 7, time: 1.25 };
  assert.deepEqual(parseFileMention(blobMentionHref(file)), { kind: 'blob', ...file });
  assert.deepEqual(readBlobMention({ ...file, name: 'file', extra: 'ignored' }), { ...file, name: 'file' });
  assert.equal(parseFileMention(blobMentionHref({ ...file, page: 0 })), undefined);
  assert.equal(parseFileMention(blobMentionHref({ ...file, time: -1 })), undefined);
});
test('Markdown local paths decode once without taking over web, relative or API links', () => {
  const path = '/home/windy/Downloads/素材/中文 前倾版.png';
  assert.equal((parseFileMention(encodeURI(path)) as any).path, path);
  assert.equal((parseFileMention('file:///tmp/a%2520b.png') as any).path, '/tmp/a%20b.png');
  assert.deepEqual(parseFileMention('/tmp/report.pdf#page=3'), { kind: 'local', path: '/tmp/report.pdf', page: 3, time: undefined });
  for (const href of ['https://example.com/a.png', '//example.com/a.png', 'relative.png', '/api/sessions/s', 'javascript:alert(1)', 'data:text/plain,abc', '/tmp/%00file', '/tmp/%GG', 'file://remote/a.txt'])
    assert.equal(parseFileMention(href), undefined, href);
  assert.equal(parseFileMention('wish://blob/s/not-a-digest'), undefined);
  assert.equal(parseFileMention(`wish://blob/a%2Fb/${'a'.repeat(64)}`), undefined);
});
test('only durable blob mention results become visible transcript cards', () => {
  const mention = { owner: 's', id: 'a'.repeat(64), page: 2, name: 'file.pdf' };
  const step = { key: 'result-1', kind: 'entry', entry: { payload: { tool_name: 'blob', result: { status: 'success', output: { mention } } } } };
  const chip = { type: 'process', steps: [step] };
  const expected = [{ key: 'result-1', mention }];
  for (const row of [chip, { type: 'chips', chips: [chip] }, { type: 'entry', before: [chip] }, { type: 'image_album', items: [{ before: [chip] }] }])
    assert.deepEqual(rowBlobMentions(row), expected);
  assert.deepEqual(rowBlobMentions({ type: 'process', steps: [{ ...step, entry: { payload: { tool_name: 'shell', result: { output: { mention } } } } }] }), []);
});
