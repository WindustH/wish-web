import test from 'node:test';
import assert from 'node:assert/strict';
import { replayConfigChanges } from '../src/core/configMerge.ts';

test('settings conflict replays local edits while keeping unrelated remote changes', () => {
  const base = { defaults: { cwd: '/old', model: 'a' }, providers: { go: { headers: { foo: 'old' } } } };
  const edited = { defaults: { cwd: '/local', model: 'a' }, providers: { go: { headers: {} } } };
  const latest = { defaults: { cwd: '/old', model: 'b' }, providers: {
    go: { headers: { foo: 'remote', bar: 'new' } }, added: { enabled: true },
  } };
  assert.deepEqual(replayConfigChanges(base, edited, latest), {
    defaults: { cwd: '/local', model: 'b' },
    providers: { go: { headers: { bar: 'new' } }, added: { enabled: true } },
  });
});
