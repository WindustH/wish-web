import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewCache } from '../src/core/util/previewCache.ts';

test('preview cache evicts least recently used artifacts within byte and entry limits', () => {
  const cache = new PreviewCache(6, 2);
  const blob = new Blob(['abc']);
  cache.set('a', blob);
  cache.set('b', blob);
  assert.equal(cache.get('a'), blob);
  cache.set('c', blob);
  assert.equal(cache.get('b'), undefined);
  cache.set('large', new Blob(['1234567']));
  assert.equal(cache.get('large'), undefined);
  cache.set('empty', null);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('empty'), null);
  cache.clear();
  assert.equal(cache.get('c'), undefined);
});

test('preview artifacts expire even when recently read', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const cache = new PreviewCache(10, 2, 100);
  cache.set('cover', new Blob(['cover']));
  t.mock.timers.tick(99);
  assert.ok(cache.get('cover'));
  t.mock.timers.tick(1);
  assert.equal(cache.get('cover'), undefined);
});
