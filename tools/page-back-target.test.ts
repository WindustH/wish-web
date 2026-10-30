import test from 'node:test';
import assert from 'node:assert/strict';
import { pageBackTarget } from '../src/features/shell/pageBackTarget.ts';

test('mobile settings return through categories and their original chat before home', () => {
  assert.equal(pageBackTarget('/settings', { section: 'accounts' }, '/s/123'), '/settings');
  assert.equal(pageBackTarget('/settings', {}, '/s/123'), '/s/123');
  assert.equal(pageBackTarget('/s/123', {}, '/sessions'), '/sessions');
  assert.equal(pageBackTarget('/sessions', {}, '/sessions'), null);
});
test('session panels and other root sections return to their logical parent', () => {
  for (const panel of ['info', 'search', 'settings']) assert.equal(pageBackTarget(`/s/123/${panel}`, {}, '/sessions'), '/s/123');
  for (const path of ['/stats', '/data']) assert.equal(pageBackTarget(path, {}, '/s/123'), '/s/123');
  for (const path of ['/sessions/all', '/new', '/account', '/g/123']) assert.equal(pageBackTarget(path, {}, '/sessions'), '/sessions');
});


test('extension details return through the extension overview for both current and legacy links', () => {
  for (const tool of ['image_generation', 'video_generation', 'audio_generation', 'audio_transcription', 'fetch', 'search']) {
    assert.equal(pageBackTarget('/settings', { section: 'extensions', tool }, '/s/123'), '/settings?section=extensions');
    assert.equal(pageBackTarget('/settings', { section: tool }, '/s/123'), '/settings?section=extensions');
  }
  assert.equal(pageBackTarget('/settings', { section: 'extensions' }, '/s/123'), '/settings');
  assert.equal(pageBackTarget('/settings', { section: 'extensions', tool: 'unknown' }, '/s/123'), '/settings');
  assert.equal(pageBackTarget('/settings', { section: 'accounts', tool: 'search' }, '/s/123'), '/settings');
});
