import test from 'node:test';
import assert from 'node:assert/strict';
import { completeHistoryContext } from '../src/core/api/historyContext.ts';
import type { EntryView } from '../src/core/api/projections.ts';
import { groupEntries, inlineChips } from '../src/features/sessions/grouping.ts';
import { imageAlbums } from '../src/features/sessions/imageAlbums.ts';

const entry = (seq: number, kind: EntryView['kind'], content: any[] = []): EntryView => ({ seq, id: seq, created_at: 1, kind, payload: { content } });
const image = (seq: number) => entry(seq, 'user_message', [{ type: 'image', mime_type: 'image/png', data_base64: String(seq) }]);
const words = (seq: number) => entry(seq, 'assistant_message', [{ type: 'text', text: 'message boundary' }]);
const work = (seq: number) => entry(seq, 'assistant_message', [{ type: 'reasoning', text: 'work' }]);

test('a split image group is completed across all pages before it is returned', async () => {
  const pages = [
    { items: [image(7), work(6), image(5)], has_more: true },
    { items: [work(4), image(3), words(2), image(1)], has_more: false },
  ];
  const cursors: number[] = [];
  const result = await completeHistoryContext({ items: [words(10), image(9), work(8)], has_more: true }, 'desc', async cursor => {
    cursors.push(cursor); return pages.shift()!;
  });
  assert.deepEqual(cursors, [8, 5]);
  assert.deepEqual(result.items.map(e => e.seq), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  assert.equal(result.has_more, true, 'the unrelated older image stays paged');
  const album = imageAlbums(inlineChips(groupEntries(result.items.toReversed()))).find(row => row.type === 'image_album');
  assert.ok(album);
  assert.equal(album.items.length, 4, 'the first published album already includes all four pictures');
});

test('newer pages complete the other end of an image group after search navigation', async () => {
  const result = await completeHistoryContext({ items: [image(5), work(6)], has_more: true }, 'asc', async edge => {
    assert.equal(edge, 6);
    return { items: [image(7), work(8), image(9), words(10), image(11)], has_more: true };
  });
  assert.deepEqual(result.items.map(e => e.seq), [5, 6, 7, 8, 9, 10]);
  assert.equal(result.has_more, true);
});

test('a page already ending at a visible message does not fetch unrelated history', async () => {
  let calls = 0;
  const initial = { items: [image(9), words(8), entry(7, 'history_event')], has_more: true };
  const result = await completeHistoryContext(initial, 'desc', async () => { calls++; throw new Error(); });
  assert.equal(calls, 0);
  assert.equal(result, initial);
});

test('activity groups finish at a picture boundary instead of swallowing another album', async () => {
  const result = await completeHistoryContext({ items: [words(9), work(8)], has_more: true }, 'desc', async () => ({ items: [work(7), image(6), work(5)], has_more: true }));
  assert.deepEqual(result.items.map(e => e.seq), [9, 8, 7]);
  assert.equal(result.has_more, true);
});

test('another speaker, questions and failed runs stop the continuation', async () => {
  const boundaries = [entry(6, 'run_error'), entry(6, 'assistant_message', [{ type: 'tool_call', id: 'q', name: 'ask_user', arguments: {} }])];
  for (const boundary of boundaries) {
    const result = await completeHistoryContext({ items: [image(9), work(8)], has_more: true }, 'desc', async () => ({ items: [image(7), boundary, image(5)], has_more: true }));
    assert.deepEqual(result.items.map(e => e.seq), [9, 8, 7, 6]);
  }
  const differentSpeaker = entry(7, 'assistant_message', [{ type: 'image', data_base64: 'other' }]);
  const result = await completeHistoryContext({ items: [image(9), work(8)], has_more: true }, 'desc', async () => ({ items: [differentSpeaker, image(6)], has_more: true }));
  assert.deepEqual(result.items.map(e => e.seq), [9, 8]);
});

test('cancellation and non-advancing cursors stop background completion', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(completeHistoryContext({ items: [image(9)], has_more: true }, 'desc', async () => {
    calls++; controller.abort(); return { items: [image(8)], has_more: true };
  }, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
  await assert.rejects(completeHistoryContext({ items: [image(9)], has_more: true }, 'desc', async () => ({ items: [image(9)], has_more: true })), /did not advance/);
});

test('a final empty page finishes a group without inventing a boundary', async () => {
  const result = await completeHistoryContext({ items: [image(9)], has_more: true }, 'desc', async () => ({ items: [], has_more: false }));
  assert.deepEqual(result.items.map(e => e.seq), [9]);
  assert.equal(result.has_more, false);
});
