import test from 'node:test';
import assert from 'node:assert/strict';
import { pageBackTarget } from '../src/features/shell/pageBackTarget.ts';

test('mobile settings return through categories and their original chat before home', () => {
  assert.equal(pageBackTarget('/settings', true, '/s/123'), '/settings');
  assert.equal(pageBackTarget('/settings', false, '/s/123'), '/s/123');
  assert.equal(pageBackTarget('/s/123', false, '/sessions'), '/sessions');
  assert.equal(pageBackTarget('/sessions', false, '/sessions'), null);
});
test('session panels and other root sections return to their logical parent', () => {
  for (const panel of ['info', 'search', 'settings']) assert.equal(pageBackTarget(`/s/123/${panel}`, false, '/sessions'), '/s/123');
  for (const path of ['/stats', '/data']) assert.equal(pageBackTarget(path, false, '/s/123'), '/s/123');
  for (const path of ['/sessions/all', '/new', '/account', '/g/123']) assert.equal(pageBackTarget(path, false, '/sessions'), '/sessions');
});
