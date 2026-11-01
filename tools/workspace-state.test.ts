import test from 'node:test';
import assert from 'node:assert/strict';
import { use } from '../src/platform/index.ts';
import { readWorkspaceState, writeWorkspaceState } from '../src/core/util/workspaceState.ts';
import { zoomAt } from '../src/domain/media/imageTransform.ts';

test('zoom preserves the image coordinate under the pointer, including after panning and at limits', () => {
  for (const next of [0.5, 1.5, 4, 20]) {
    const before = { zoom: 2, x: -30, y: 20 };
    const after = zoomAt(before.zoom, before.x, before.y, next, 70, -40);
    assert.ok(Math.abs((70 - after.x) / after.zoom - (70 - before.x) / before.zoom) < 1e-8);
    assert.ok(Math.abs((-40 - after.y) / after.zoom - (-40 - before.y) / before.zoom) < 1e-8);
    assert.ok(after.zoom >= 1 && after.zoom <= 8);
  }
});

test('workspace states are isolated, bounded and tolerate malformed or unavailable storage', () => {
  const values = new Map<string, string>();
  use('storage', { get: key => values.get(key) ?? null, set: (key, value) => { values.set(key, value); },
    remove: key => { values.delete(key); }, keys: () => [...values.keys()], clear: () => values.clear() });
  writeWorkspaceState('server-a/session-a/pdf', { page: 7, zoom: 2 });
  writeWorkspaceState('server-b/session-a/pdf', { page: 2 });
  assert.equal(readWorkspaceState('server-a/session-a/pdf', { page: 1 }).page, 7);
  assert.equal(readWorkspaceState('server-b/session-a/pdf', { page: 1 }).page, 2);
  assert.equal(readWorkspaceState('server-a/session-b/pdf', { page: 1 }).page, 1);
  for (let i = 0; i < 110; i++) writeWorkspaceState(String(i), { page: i });
  assert.equal(JSON.parse([...values.values()][0]!).length, 100);
  assert.equal(readWorkspaceState('server-a/session-a/pdf', { page: 1 }).page, 1);
  values.set('workspace.views.v1', '{bad json');
  assert.equal(readWorkspaceState('x', { page: 1 }).page, 1);
  writeWorkspaceState('x', { page: 'invalid', zoom: Infinity });
  assert.deepEqual(readWorkspaceState('x', { page: 1, zoom: 1 }), { page: 1, zoom: 1 });
});
