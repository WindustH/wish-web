import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnhandledRejectionReporter } from '../src/ui/unhandledErrors.ts';

test('background rejections coalesce into a nonmodal notice and cancellation stays silent', (t) => {
  t.mock.method(console, 'error', () => {});
  let at = 0,
    notices = 0;
  const report = createUnhandledRejectionReporter(
    () => {
      notices++;
    },
    () => at,
  );
  const event = (reason: unknown) => ({ reason, preventDefault() {} });
  report(event(new DOMException('cancelled', 'AbortError')));
  assert.equal(notices, 0);
  for (let count = 0; count < 10; count++) report(event(new Error('offline')));
  assert.equal(notices, 1);
  at = 5000;
  report(event(new Error('offline')));
  assert.equal(notices, 2);
});
