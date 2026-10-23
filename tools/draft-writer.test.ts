import { test } from 'node:test';
import assert from 'node:assert/strict';
import { use } from '../src/platform/index.ts';
import {
  DRAFT_PERSIST_MS, POLL_FAILURES_BEFORE_CARD, chat, createDraftWriter, shouldSurfacePollFailure,
} from '../src/core/state/chatSlice.ts';

/** A storage stand-in that records every write, so a debounce is visible as an absent call. */
function fakeStore() {
  const data = new Map<string, string>();
  const writes: [string, string][] = [];
  return {
    data, writes,
    get: (key: string) => data.get(key) ?? null,
    set: (key: string, value: string) => { writes.push([key, value]); data.set(key, value); },
  };
}

test('typing writes once, after the pause', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = fakeStore();
  const drafts = createDraftWriter(store);
  for (const text of ['h', 'he', 'hel', 'hell', 'hello']) drafts.write('s1', text);
  assert.deepEqual(store.writes, [], 'nothing lands while the keys are still coming');
  t.mock.timers.tick(DRAFT_PERSIST_MS - 1);
  assert.deepEqual(store.writes, []);
  t.mock.timers.tick(1);
  assert.deepEqual(store.writes, [['draft.s1', 'hello']], 'one write, with the text as it ended');
});

test('flush lands the waiting draft at once, and the timer lands nothing twice', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = fakeStore();
  const drafts = createDraftWriter(store);
  drafts.write('s1', 'half-typed');
  drafts.flush();
  assert.deepEqual(store.writes, [['draft.s1', 'half-typed']]);
  t.mock.timers.tick(DRAFT_PERSIST_MS * 4);
  assert.equal(store.writes.length, 1);
});

test('a draft still waiting lands when another id is written', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = fakeStore();
  const drafts = createDraftWriter(store);
  drafts.write('a', 'alpha');
  drafts.write('b', 'beta');
  assert.deepEqual(store.writes, [['draft.a', 'alpha']], 'the left session lands before the new one');
  t.mock.timers.tick(DRAFT_PERSIST_MS);
  assert.deepEqual(store.writes, [['draft.a', 'alpha'], ['draft.b', 'beta']]);
});

test('reading a draft returns what was typed, not what storage last held', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = fakeStore();
  store.data.set('draft.a', 'old');
  const drafts = createDraftWriter(store);
  drafts.write('a', 'new');
  assert.equal(drafts.read('a'), 'new');
  assert.equal(store.data.get('draft.a'), 'old');
  drafts.flush();
  assert.equal(drafts.read('a'), 'new');
  assert.equal(store.data.get('draft.a'), 'new');
});

test('an emptied draft lands at once, so a sent message cannot come back', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = fakeStore();
  const drafts = createDraftWriter(store);
  drafts.write('s1', 'hello');
  drafts.write('s1', '');
  assert.deepEqual(store.writes, [['draft.s1', '']], 'the send path does not wait for the delay');
  t.mock.timers.tick(DRAFT_PERSIST_MS * 4);
  assert.equal(store.writes.length, 1);
});

test('flushing one id leaves the other waiting', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = fakeStore();
  const drafts = createDraftWriter(store);
  drafts.write('a', 'alpha');
  drafts.write('b', 'beta');       // lands a, keeps b
  drafts.write('b', 'beta2');
  drafts.flush('b');
  assert.deepEqual(store.writes, [['draft.a', 'alpha'], ['draft.b', 'beta2']]);
  assert.equal(drafts.hasPending(), false);
  t.mock.timers.tick(DRAFT_PERSIST_MS * 4);
  assert.equal(store.writes.length, 2);
});

test('the chat slice writes drafts through platform storage, on the same delay', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = fakeStore();
  use('storage', {
    get: store.get, set: store.set, remove: () => {}, keys: () => [], clear: () => {},
  });
  chat.setDraft('typed', 's9');
  assert.equal(chat.getDraft('s9'), 'typed', 'the field reads its own unfiled text');
  assert.deepEqual(store.writes, [], 'no write per keystroke');
  t.mock.timers.tick(DRAFT_PERSIST_MS);
  assert.deepEqual(store.writes, [['draft.s9', 'typed']]);
  chat.flushDrafts('s9');       // nothing pending: no second write
  assert.equal(store.writes.length, 1);
});

test('a poll that fails once is not worth a card, a poll that keeps failing is', () => {
  assert.equal(shouldSurfacePollFailure(0), false);
  assert.equal(shouldSurfacePollFailure(1), false, 'a blink: offline for a moment, the poll asks again');
  assert.equal(shouldSurfacePollFailure(POLL_FAILURES_BEFORE_CARD - 1), false);
  assert.equal(shouldSurfacePollFailure(POLL_FAILURES_BEFORE_CARD), true);
  assert.equal(shouldSurfacePollFailure(POLL_FAILURES_BEFORE_CARD + 5), true);
});
