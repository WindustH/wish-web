import test from 'node:test';
import assert from 'node:assert/strict';
import { groupEntries, inlineChips, type GroupBlock, type GroupEntry } from '../src/features/sessions/grouping.ts';
import { albumHeight, imageAlbums, imageParts } from '../src/features/sessions/imageAlbums.ts';
import { estimateRow } from '../src/features/sessions/rowEstimate.ts';

const image = (id: number) => ({ type: 'image', id: String(id) });
const pictures = (seq: number, count = 1, kind = 'user_message'): GroupEntry => ({
  seq, kind, payload: { content: Array.from({ length: count }, (_, i) => image(seq * 10 + i)) },
});
const render = (entries: GroupEntry[]) => imageAlbums(inlineChips(groupEntries(entries)));
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('four consecutive images form an album; three remain individual, with text and files in place', () => {
  const blocks = freeze([
    { type: 'text', text: 'before' }, ...[1, 2, 3, 4].map(image),
    { type: 'file' }, ...[5, 6, 7].map(image), { type: 'text', text: 'after' },
  ]);
  const parts = imageParts(blocks);
  assert.deepEqual(parts.map(part => part.type === 'album' ? 'album' : part.block.type), ['text', 'album', 'file', 'image', 'image', 'image', 'text']);
  const album = parts[1]!;
  assert.equal(album.type, 'album');
  if (album.type === 'album') assert.deepEqual(album.blocks, blocks.slice(1, 5));
  assert.equal(imageParts([image(1), image(2), image(3)]).length, 3);
});

test('adjacent image messages combine without editing canonical messages, seqs, or image order', () => {
  const entries = freeze([pictures(1), pictures(2), pictures(3), pictures(4)]);
  const rows = render(entries);
  assert.equal(rows.length, 1);
  const album = rows[0]!;
  assert.equal(album.type, 'image_album');
  if (album.type !== 'image_album') return;
  assert.deepEqual(album.items.map(item => item.entry.seq), [1, 2, 3, 4]);
  album.items.forEach((item, i) => assert.equal(item.entry, entries[i]));
  assert.deepEqual(album.items.flatMap(item => item.blocks.map(block => block.id)), ['10', '20', '30', '40']);
  const five = render([...entries, pictures(5)])[0]!;
  assert.equal(five.key, album.key, 'appending an image retains the virtual row identity');
  assert.equal(render([{ kind: 'user_message', seq: 0, payload: { content: [{ type: 'text', text: 'older' }] } }, ...entries])[1]!.key, album.key);
});

test('the threshold counts pictures, including several pictures in a single message', () => {
  assert.equal(render([pictures(1, 3)])[0]!.type, 'entry');
  assert.equal(render([pictures(1, 4)])[0]!.type, 'image_album');
  assert.equal(render([pictures(1, 2), pictures(2, 2)])[0]!.type, 'image_album');
  const rows = inlineChips(groupEntries([pictures(1), pictures(2), pictures(3)]));
  const unchanged = imageAlbums(rows);
  rows.forEach((row, i) => assert.equal(row, unchanged[i]));
});

test('tool activity between assistant pictures stays on the rail while the pictures combine', () => {
  const entries: GroupEntry[] = [];
  for (let i = 0; i < 4; i++) {
    entries.push({ kind: 'assistant_message', seq: i * 3, payload: { content: [{ type: 'tool_call', name: 'shell_start', id: `c${i}` }] } });
    entries.push({ kind: 'tool_result', seq: i * 3 + 1 });
    entries.push(pictures(i * 3 + 2, 1, 'assistant_message'));
  }
  const rows = render(freeze(entries));
  assert.equal(rows.length, 1);
  const album = rows[0]!;
  assert.equal(album.type, 'image_album');
  if (album.type !== 'image_album') return;
  assert.equal(album.items.flatMap(item => item.before ?? []).length, 4);
  assert.deepEqual(album.items.map(item => item.entry.seq), [2, 5, 8, 11]);
});

test('text, files, another speaker, notices and questions interrupt albums', () => {
  const content = (type: string): GroupEntry => ({ kind: 'user_message', seq: 9, payload: { content: [{ type, text: 'break' }] } });
  const boundaries: GroupEntry[] = [content('text'), content('file'), pictures(9, 1, 'assistant_message'),
    { kind: 'system_message', seq: 9, payload: { content: [{ type: 'text', text: 'notice' }] } },
    { kind: 'assistant_message', seq: 9, payload: { content: [{ type: 'tool_call', name: 'ask_user', id: 'q' }] } },
  ];
  for (const boundary of boundaries) {
    const rows = render([pictures(1), pictures(2), boundary, pictures(3), pictures(4)]);
    assert.ok(rows.every(row => row.type !== 'image_album'), `${boundary.kind} / ${boundary.payload?.content?.[0]?.type}`);
  }
  const assistant = render([pictures(1, 2, 'assistant_message'), boundaries[3]!, pictures(2, 2, 'assistant_message')]);
  assert.ok(assistant.every(row => row.type !== 'image_album'), 'a notice attached to the next assistant image is still a boundary');
});

test('grid height estimates match its columns rather than a vertical stack of full images', () => {
  const album = render([pictures(1, 6)])[0]!;
  assert.equal(album.type, 'image_album');
  assert.equal(estimateRow(album, 334), 24 + albumHeight(6, 334));
  assert.ok(estimateRow(album, 736) < 6 * 220);
  const content: GroupBlock[] = [{ type: 'text', text: 'caption' }, ...[1, 2, 3, 4].map(image)];
  const row = groupEntries([{ kind: 'assistant_message', seq: 1, payload: { content } }])[0]!;
  assert.ok(estimateRow(row, 334) < 4 * 220);
});
