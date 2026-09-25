import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shallowRef } from 'vue';
import { createChatDeliveries } from '../src/core/state/chatDeliveries.ts';
const deferred = () => { let resolve!: (value?: unknown) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
test('switching sessions during attachment upload cannot send or poll for the new session', async () => {
  const upload = deferred(), calls: string[] = [];
  const sessionId = shallowRef('a');
  const state = createChatDeliveries({
    sessionId, snapshot: shallowRef({ phase: 'idle' }), stream: shallowRef({ active: false }),
    error: shallowRef(null), options: () => ({}), scheduleRefresh: () => calls.push('refresh'),
    upload: () => upload.promise,
    requests: { messageSend: () => calls.push('send'), deliveriesList: () => calls.push('poll') } as any,
  });
  const pending = state.send('hello', []);
  state.reset(); sessionId.value = 'b';
  upload.resolve({ blocks: [] });
  assert.equal(await pending, null);
  assert.deepEqual(calls, []);
  assert.equal(state.sending.value, false);
});
test('idle sends stay out of the optimistic queue; active sends appear immediately', async () => {
  const stream = shallowRef({ active: false });
  const state = createChatDeliveries({
    sessionId: shallowRef('a'), snapshot: shallowRef({ phase: 'idle' }), stream,
    error: shallowRef(null), options: () => ({}), scheduleRefresh: () => {},
    upload: async () => ({ blocks: [] }),
    requests: { messageSend: async () => ({ id: 'sent' }), deliveriesList: () => new Promise(() => {}) } as any,
  });
  await state.send('hello');
  assert.deepEqual(state.deliveries.value, [] as typeof state.deliveries.value);
  state.reset(); stream.value = { active: true };
  await state.send('queued');
  assert.equal(state.deliveries.value[0].text, 'queued');
});
