import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoundedCache } from '../src/core/util/boundedCache.js';
test('cache bounds retained text and preserves recently read values', () => {
  const cache = createBoundedCache(3, 12);
  cache.set('a', '111'); cache.set('b', '222'); cache.set('c', '333');
  assert.equal(cache.get('a'), '111');
  cache.set('d', '444');
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), '111');
  cache.set('huge', 'x'.repeat(100));
  assert.equal(cache.get('huge'), undefined);
  cache.set('a', '1'); cache.set('e', '5');
  assert.equal(cache.get('a'), '1');
});
