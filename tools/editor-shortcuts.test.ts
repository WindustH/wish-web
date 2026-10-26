import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutDeletion } from '../src/features/sessions/editorShortcuts.ts';

test('Ctrl+C copies a selection and clears only an unselected draft', () => {
  assert.equal(shortcutDeletion('c', 'draft', 1, 3), undefined);
  assert.deepEqual(shortcutDeletion('c', 'draft', 2, 2), {start: 0, end: 5});
});
test('line and word deletions preserve the rest of a multiline draft', () => {
  const text = 'first\nhello world\nlast';
  assert.deepEqual(shortcutDeletion('u', text, 12, 12), {start: 6, end: 12});
  assert.deepEqual(shortcutDeletion('k', text, 12, 12), {start: 12, end: 17});
  assert.deepEqual(shortcutDeletion('k', text, 17, 17), {start: 17, end: 18});
  assert.deepEqual(shortcutDeletion('w', 'hello 中文  ', 10, 10), {start: 6, end: 10});
  assert.deepEqual(shortcutDeletion('u', text, 7, 9), {start: 7, end: 9});
  assert.equal(shortcutDeletion('v', text, 0, 0), undefined);
});
