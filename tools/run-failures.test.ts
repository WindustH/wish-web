import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunFailureWatch } from '../src/core/runFailures.ts';

const failure = { message: 'rate limited', family: 'Upstream · HTTP 429' };
test('a run that ends in failure is reported once', () => {
  const watch = createRunFailureWatch();
  assert.equal(watch.observe({ id: 's', running: true, last_error: null }), null);
  assert.equal(watch.observe({ id: 's', running: false, last_error: failure }), failure);
  assert.equal(watch.observe({ id: 's', running: false, last_error: failure }), null);
});
test('failures that were already there when the page loaded stay quiet', () => {
  const watch = createRunFailureWatch();
  assert.equal(watch.observe({ id: 's', running: false, last_error: failure }), null);
});
test('completed runs and forgotten sessions are not reported', () => {
  const watch = createRunFailureWatch();
  watch.observe({ id: 'a', running: true });
  assert.equal(watch.observe({ id: 'a', running: false, last_error: null }), null);
  watch.observe({ id: 'b', running: true });
  watch.forget('b');
  assert.equal(watch.observe({ id: 'b', running: false, last_error: failure }), null);
});
