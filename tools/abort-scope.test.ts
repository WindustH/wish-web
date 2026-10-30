import test from 'node:test';
import assert from 'node:assert/strict';
import { createAbortScope } from '../src/core/util/abortScope.ts';
import { get, setBaseUrl, ApiError } from '../src/core/api/client.ts';

test('cancellation and timeouts work without AbortSignal.any or AbortSignal.timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const any = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')!;
  Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true });
  Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
  try {
    setBaseUrl('https://fixture.test/api');
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
    );
    assert.deepEqual(await get('/test'), { ok: true });
    const caller = new AbortController();
    const scope = createAbortScope([caller.signal], 100);
    const reason = new DOMException('cancelled', 'AbortError');
    caller.abort(reason);
    t.mock.timers.tick(100);
    assert.equal(scope.signal.reason, reason);
    assert.equal(scope.timedOut, false);
    scope.dispose();
  } finally {
    Object.defineProperty(AbortSignal, 'any', any);
    Object.defineProperty(AbortSignal, 'timeout', timeout);
  }
});
test('the deadline covers a stalled response body, not just its headers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  setBaseUrl('https://fixture.test/api');
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const body = new ReadableStream({
      start(controller) {
        options.signal!.addEventListener('abort', () => controller.error(options.signal!.reason), { once: true });
      },
    });
    return new Response(body, { headers: { 'content-type': 'application/json' } });
  });
  const response = get('/test', { timeoutMs: 100 });
  await Promise.resolve();
  t.mock.timers.tick(100);
  await assert.rejects(response, (error) => error instanceof ApiError && error.detail === 'request timed out');
});
test('normal completion disposes upstream listeners and the pending timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const caller = new AbortController();
  const removed = t.mock.method(caller.signal, 'removeEventListener');
  const scope = createAbortScope([caller.signal], 100);
  scope.dispose();
  assert.equal(removed.mock.callCount(), 1);
  caller.abort();
  t.mock.timers.tick(100);
  assert.equal(scope.signal.aborted, false);
});
