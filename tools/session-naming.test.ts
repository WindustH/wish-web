import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionNaming } from '../src/core/state/sessionNaming.ts';
test('naming uses the explicit context mode and applies the captured revision', async () => {
  const calls: unknown[] = [];
  const state = createSessionNaming({
    sessionGenerateName: async (...args) => { calls.push(args); return { name: 'New title', revision: 7 }; },
    sessionRename: async (...args) => { calls.push(args); return {} as any; },
  }, () => {});
  await state.generate('one');
  assert.deepEqual(calls, [['one', { mode: 'context' }], ['one', 'New title', 7]]);
  assert.equal(state.pending.value.size, 0);
});
test('first-message naming is deduplicated while pending, and conflicts are not retried', async () => {
  let finish!: (value: {name: string; revision: number}) => void;
  let calls = 0, writes = 0;
  const notices: string[] = [];
  const state = createSessionNaming({
    sessionGenerateName: async (_id, input) => {
      calls++; assert.deepEqual(input, { mode: 'first_message', entry: 3 });
      return new Promise(resolve => { finish = resolve; });
    },
    sessionRename: async () => { writes++; throw new Error('revision conflict'); },
  }, message => { notices.push(message); return 0; });
  const pending = state.generate('one', 3);
  await state.generate('one', 3);
  assert.equal(calls, 1);
  assert.ok(state.pending.value.has('one'));
  finish({ name: 'Generated', revision: 4 }); await pending;
  assert.equal(writes, 1); assert.equal(notices.length, 1);
  assert.equal(state.pending.value.size, 0);
});
