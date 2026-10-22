import test from 'node:test';
import assert from 'node:assert/strict';
import { groupEntries, inlineChips, type GroupBlock, type GroupEntry } from '../src/features/sessions/grouping.ts';
import { albumHeight, imageAlbums, imageParts } from '../src/features/sessions/imageAlbums.ts';
import { estimateRow } from '../src/features/sessions/rowEstimate.ts';
import { entryView } from '../src/core/api/projections.ts';

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

test('visible text, files, another speaker, errors and questions interrupt albums', () => {
  const content = (type: string): GroupEntry => ({ kind: 'user_message', seq: 9, payload: { content: [{ type, text: 'break' }] } });
  const boundaries: GroupEntry[] = [content('text'), content('file'), pictures(9, 1, 'assistant_message'),
    { kind: 'run_error', seq: 9, payload: { content: [{ type: 'text', text: 'failure' }] } },
    { kind: 'developer_message', seq: 9, payload: { metadata: { source: 'ask_user_answer' }, content: [{ type: 'text', text: 'answer' }] } } as GroupEntry,
    { kind: 'assistant_message', seq: 9, payload: { content: [{ type: 'tool_call', name: 'ask_user', id: 'q' }] } },
  ];
  for (const boundary of boundaries) {
    const rows = render([pictures(1), pictures(2), boundary, pictures(3), pictures(4)]);
    assert.ok(rows.every(row => row.type !== 'image_album'), `${boundary.kind} / ${boundary.payload?.content?.[0]?.type}`);
  }
});

test('rail-only notices do not interrupt visually consecutive pictures for either speaker', () => {
  for (const kind of ['user_message', 'assistant_message']) {
    const rows = render([pictures(1, 2, kind),
      { kind: 'system_message', seq: 9, payload: { content: [{ type: 'text', text: 'notice in rail' }] } },
      pictures(2, 2, kind)]);
    const album = rows.find(row => row.type === 'image_album');
    assert.ok(album);
    assert.deepEqual(album.items.flatMap(item => item.before ?? []).map(chip => chip.type), ['entry']);
  }
});

// view_image emits a native User image with origin Tool, separately from ToolResult. This is
// the shape found in # OS Course: reasoning, calls and background completions fill the rail
// between image-only messages, without adding visible transcript text.
function toolPictureHistory(count: number) {
  let seq = 0;
  const native = (message: object, origin = 'Model') => entryView({
    record: { sequence: ++seq, recorded_at: 1, model_call_id: 1 },
    content: { kind: 'entry', value: { id: seq, origin, message } },
  }, 'image-session');
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (i) entries.push(native({ Developer: { metadata: { source: 'background_execution_finished',
      completion: { command: 'render frame', result: { process: { status: 'exited', exit_code: 0 } } } },
      content: [{ Text: { text: 'Background render completed' } }] } }, 'Input'));
    entries.push(native({ Reasoning: { plaintext: 'Check the next frame', display: null } }));
    entries.push(native({ ToolUse: { call_id: `view-${i}`, name: 'view_image', arguments: { path: `/tmp/frame-${i}.jpg` } } }));
    entries.push(native({ ToolResult: { call_id: `view-${i}`, name: 'view_image', content: { status: 'success', output: { path: `/tmp/frame-${i}.jpg`, mime_type: 'image/jpeg' } } } }, 'Tool'));
    entries.push(native({ User: { metadata: { tool_call_id: `view-${i}`, tool_name: 'view_image' },
      content: [{ Image: { mime_type: 'image/jpeg', data_base64: `image-${i}` } }] } }, 'Tool'));
  }
  return freeze(entries);
}

test('native view_image outputs form a user album across standalone process and background hosts', () => {
  const entries = toolPictureHistory(4);
  const original = inlineChips(groupEntries(entries));
  const rows = imageAlbums(original);
  assert.deepEqual(rows.map(row => row.type), ['chips', 'image_album']);
  const album = rows[1]!;
  assert.equal(album.type, 'image_album');
  if (album.type !== 'image_album') return;
  assert.deepEqual(album.items.map(item => item.entry.seq), entries.filter(e => e.kind === 'user_message').map(e => e.seq));
  assert.equal(album.items.flatMap(item => item.blocks).length, 4);
  const activity = (rendered: typeof original | typeof rows) => rendered.flatMap(row => row.type === 'chips' ? row.chips
    : row.type === 'image_album' ? row.items.flatMap(item => item.before ?? []) : row.type === 'entry' ? (row as { before?: { key: string }[] }).before ?? [] : []).map(chip => chip.key);
  assert.deepEqual(activity(rows), activity(original), 'every activity remains in order and can still be opened on the rail');
});

test('a short native image run restores the original rows and activity hosts exactly', () => {
  const original = inlineChips(groupEntries(toolPictureHistory(3)));
  const rows = imageAlbums(original);
  assert.equal(rows.length, original.length);
  original.forEach((row, i) => assert.equal(rows[i], row));
});

test('trailing work remains after an album and visible text starts a separate image run', () => {
  const entries: GroupEntry[] = [...toolPictureHistory(4),
    { kind: 'assistant_message', seq: 100, payload: { content: [{ type: 'reasoning', text: 'more work' }] } },
    { kind: 'user_message', seq: 101, payload: { content: [{ type: 'text', text: 'another request' }] } },
    pictures(102), pictures(103), pictures(104)];
  const original = inlineChips(groupEntries(entries));
  const rows = imageAlbums(original);
  assert.deepEqual(rows.map(row => row.type), ['chips', 'image_album', 'chips', 'entry', 'entry', 'entry', 'entry']);
  assert.equal(rows[2], original.find(row => row.type === 'chips' && row.chips.some(chip => chip.key === 's100b0')));
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
