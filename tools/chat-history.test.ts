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

test('replacing a history window aborts the old transport without aborting the session', async () => {
  const parent = new AbortController();
  const signals: AbortSignal[] = [];
  const h = createChatHistory<{ seq: number }>({
    sessionId: shallowRef('a'), error: shallowRef(null), options: () => ({ signal: parent.signal }),
    open: async () => {},
    readPage: async (_, __, opts) => {
      signals.push(opts.signal!);
      if (signals.length === 1) await new Promise((_, reject) => opts.signal!.addEventListener('abort', () => reject(opts.signal!.reason), { once: true }));
      return { items: [{ seq: 10 }], has_more: false };
    },
  });
  h.hasMoreBefore.value = true;
  const old = h.loadOlder();
  assert.equal(await h.jumpToLatest(), true);
  assert.equal(await old, false);
  assert.equal(signals[0]!.aborted, true);
  assert.equal(signals[1]!.aborted, false);
  assert.equal(parent.signal.aborted, false);
  assert.deepEqual(h.entries.value, [{ seq: 10 }]);
});

test('window cancellation releases a pagination merge blocked by the old viewport', async () => {
  const entered = deferred();
  const h = setup(async () => ({ items: [{ seq: 1 }], has_more: false }));
  h.hasMoreBefore.value = true;
  const old = h.loadOlder({ beforeMerge: () => { entered.resolve(); return new Promise(() => {}); } });
  await entered.promise;
  h.invalidate();
  assert.equal(await old, false);
  assert.equal(h.loadingOlder.value, false);
  assert.deepEqual(h.entries.value, []);
});

test('a nonadvancing newer page stops after one request and releases its busy state', async () => {
  let calls = 0;
  const error = shallowRef<unknown>(null);
  const h = createChatHistory<{ seq: number }>({
    sessionId: shallowRef('a'), error, options: () => ({}), open: async () => {},
    readPage: async () => { calls++; return { items: [{ seq: 10 }], has_more: true }; },
  });
  h.entries.value = [{ seq: 10 }]; h.bounds();
  const result = await h.fetchNewer({ pages: 100 });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.equal(h.loadingNewer.value, false);
  assert.match(String(error.value), /did not advance/);
});

test('failed or missing search targets preserve latest-window reconciliation', async () => {
  for (const failure of [true, false]) {
    const h = setup(async () => {
      if (failure) throw new Error('offline');
      return { items: [{ seq: 1 }], has_more: false };
    });
    h.entries.value = [{ seq: 100 }]; h.bounds();
    assert.equal(await h.locate('a', 50), false);
    assert.equal(h.viewingPast(), false);
    assert.deepEqual(h.entries.value, [{ seq: 100 }]);
    assert.equal(h.locating.value, false);
    assert.equal(h.pendingSeq.value, null);
  }
});
