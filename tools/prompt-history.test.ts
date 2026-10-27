import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromptHistory, sessionPrompts } from '../src/features/chat/promptHistory.ts';
import { uploadAttachments, type AttachmentInput } from '../src/core/attachments.ts';

test('history preserves edited prompts and unsent draft, resets between sessions', () => {
  const history = createPromptHistory<string>();
  const messages = () => ['first', 'last'];
  assert.equal(history.move(1, 'draft', messages), undefined);
  assert.equal(history.move(-1, 'draft', messages), 'last');
  assert.equal(history.move(-1, 'edited last', messages), 'first');
  assert.equal(history.move(-1, 'first', messages), undefined);
  assert.equal(history.move(1, 'first', messages), 'edited last');
  assert.equal(history.move(1, 'edited last', messages), 'draft');
  history.reset();
  assert.equal(history.move(-1, 'other draft', () => ['other session']), 'other session');
  assert.equal(history.move(1, 'other session', messages), 'other draft');
});

test('history restores ordered image/file tokens without duplicating repeated attachment references', () => {
  const id = 'a'.repeat(64);
  const file = { type: 'file', blob_id: `session/${id}`, filename: 'notes.txt' };
  const prompts = sessionPrompts([
    { kind: 'assistant_message', payload: { content: [{ type: 'text', text: 'ignore' }] } },
    { kind: 'user_message', payload: { content: [{ type: 'text', text: 'before' }, file, { type: 'text', text: 'after' }, file] } },
    { kind: 'group_message', payload: { content: [{ type: 'text', text: 'ignore group' }] } },
  ] as any);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0]!.text, `before<file-${id}>after<file-${id}>`);
  assert.equal(prompts[0]!.attachments.length, 1);
});

test('same-session history references bypass upload; new bytes and another owner still upload', async () => {
  let uploads = 0;
  const upload = async () => { uploads++; return { id: 'new', sha256: 'new', byte_count: 3, mime_type: 'text/plain' }; };
  const file: AttachmentInput = { kind: 'file', name: 'notes.txt', mime: 'text/plain', bytes: new ArrayBuffer(3), stored: { owner: 'A', id: 'existing' } };
  const result = await uploadAttachments('A', [file], { upload, verifyStored: async () => ({}) });
  assert.equal(uploads, 0);
  assert.equal(result.blocks[0]!.blob_id, 'existing');
  assert.equal(result.blocks[0]!.filename, 'notes.txt');
  await uploadAttachments('B', [file], { upload });
  await uploadAttachments('A', [{ ...file, stored: undefined }], { upload });
  assert.equal(uploads, 2);
});

test('older pages extend history without displacing the current prompt or draft', () => {
  const history = createPromptHistory<string>();
  assert.equal(history.move(-1, 'draft', () => ['recent']), 'recent');
  assert.equal(history.atOldest, true);
  history.prepend(['oldest', 'older']);
  assert.equal(history.move(-1, 'edited recent', () => []), 'older');
  assert.equal(history.move(1, 'edited older', () => []), 'edited recent');
  assert.equal(history.move(1, 'edited recent', () => []), 'draft');
});

test('original input metadata preserves legacy images without inserting new token text', () => {
  const prompts = sessionPrompts([{ kind: 'user_message', payload: { content: [], metadata: {
    input_text: 'original prompt', attachments: [{ kind: 'image', id: 'image-id', name: 'legacy.png' }],
  } } }] as any, 'session-A');
  assert.equal(prompts[0]!.text, 'original prompt');
  assert.equal(prompts[0]!.attachments[0]!.blob_id, 'session-A/image-id');
  assert.equal(prompts[0]!.attachments[0]!.placeholder, undefined);
});

test('the empty current input remains browsable without losing edited history', () => {
  const history = createPromptHistory<string>();
  const messages = () => ['sent prompt'];
  assert.equal(history.move(-1, '', messages), 'sent prompt');
  assert.equal(history.move(1, 'edited prompt', messages), '');
  assert.equal(history.move(1, '', messages), undefined);
  assert.equal(history.move(-1, '', messages), 'edited prompt');
  assert.equal(history.move(1, 'edited prompt', messages), '');
  assert.equal(history.move(-1, 'new draft', messages), 'edited prompt');
  assert.equal(history.move(1, 'edited prompt', messages), 'new draft');
});

test('a cleaned-up stored reference is reuploaded from draft bytes, but other errors do not upload', async () => {
  const file: AttachmentInput = {kind:'file', mime:'text/plain', bytes:new ArrayBuffer(3), stored:{owner:'A',id:'old'}};
  let uploads = 0;
  const upload = async () => {uploads++;return {id:'new',sha256:'new',byte_count:3,mime_type:'text/plain'};};
  const result = await uploadAttachments('A',[file],{upload,verifyStored:async()=>{throw {status:404};}});
  assert.equal(result.blocks[0]!.blob_id,'new');assert.equal(uploads,1);
  await assert.rejects(uploadAttachments('A',[file],{upload,verifyStored:async()=>{throw {status:503};}}));
  await assert.rejects(uploadAttachments('A',[{...file,unavailable:true}],{upload}),/unavailable/);
  assert.equal(uploads,1);
});
