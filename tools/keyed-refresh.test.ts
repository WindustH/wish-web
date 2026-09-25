import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyedRefresh } from '../src/core/util/keyedRefresh.ts';
const deferred = () => { let resolve!: (value?: unknown) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
test('event bursts trigger one trailing read while live updates remain visible', async () => {
  const first = deferred(), second = deferred(), seen: unknown[] = [];
  let reads = 0;
  const queue = createKeyedRefresh(() => (++reads === 1 ? first : second).promise, (_: string, data: unknown) => seen.push(data), () => {});
  const pending = queue.refresh('a');
  for (let i = 0; i < 20; i++) void queue.refresh('a');
  assert.equal(reads, 1);
  first.resolve('old');
  await Promise.resolve();
  assert.equal(reads, 2);
  assert.deepEqual(seen, ['old']);
  second.resolve('new');
  await pending;
  assert.deepEqual(seen, ['old', 'new']);
});
test('deleting a session suppresses its in-flight snapshot', async () => {
  const read = deferred(), seen: unknown[] = [];
  const queue = createKeyedRefresh(() => read.promise, (_: string, data: unknown) => seen.push(data), () => {});
  const pending = queue.refresh('a');
  queue.invalidate('a');
  read.resolve('deleted');
  await pending;
  assert.deepEqual(seen, []);
});
