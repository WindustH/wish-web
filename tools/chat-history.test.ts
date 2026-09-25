import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shallowRef } from 'vue';
import { createChatHistory } from '../src/core/state/chatHistory.ts';

const deferred = () => { let resolve!: (value?: unknown) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
function setup(readPage: () => Promise<any>) {
  return createChatHistory({ sessionId: shallowRef('a'), error: shallowRef(null), options: () => ({}), open: async () => {}, readPage });
}
test('empty reconciliation preserves entry identity and history version', async () => {
  const h = setup(async () => ({ items: [], has_more: false }));
  const entries = h.entries.value;
  await h.fetchNewer();
  assert.equal(h.entries.value, entries);
  assert.equal(h.historyVersion.value, 0);
});
test('superseded pagination cannot clear loading state of a newer request', async () => {
  const old = deferred(), next = deferred();
  let calls = 0;
  const h = setup(() => (++calls === 1 ? old : next).promise);
  h.hasMoreBefore.value = true;
  const first = h.loadOlder();
  h.invalidate();
  const second = h.loadOlder();
  old.resolve({ items: [{ seq: 1 }], has_more: false });
  assert.equal(await first, false);
  assert.equal(h.loadingOlder.value, true);
  assert.deepEqual(h.entries.value, [] as typeof h.entries.value);
  next.resolve({ items: [{ seq: 3 }, { seq: 2 }], has_more: false });
  assert.equal(await second, true);
  assert.deepEqual(h.entries.value.map(e => e.seq), [2, 3]);
  assert.equal(h.loadingOlder.value, false);
});
test('history replacement during beforeMerge does not insert the old page', async () => {
  const gate = deferred();
  const h = setup(async () => ({ items: [{ seq: 1 }], has_more: false }));
  h.hasMoreBefore.value = true;
  const pending = h.loadOlder({ beforeMerge: () => gate.promise });
  await Promise.resolve();
  h.invalidate();
  gate.resolve();
  assert.equal(await pending, false);
  assert.deepEqual(h.entries.value, []);
});

test('overlapping pages replace payloads, deduplicate and preserve sorted history', async () => {
  const h = setup(async () => ({ items: [{ seq: 4 }, { seq: 2, text: 'old' }, { seq: 2, text: 'new' }], has_more: false }));
  h.entries.value = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
  h.bounds();
  await h.fetchNewer();
  assert.deepEqual(h.entries.value, [{ seq: 1 }, { seq: 2, text: 'new' }, { seq: 3 }, { seq: 4 }]);
});
