import test from 'node:test';
import assert from 'node:assert/strict';
import { virtualWindow } from '../src/ui/virtualWindow.ts';

test('thousands of tools mount only the viewport and nearby rows', () => {
  const first = virtualWindow(5000, 84, 480, 0);
  assert.equal(first.start, 0);
  assert.ok(first.end <= 9);
  assert.equal(first.total, 420000);
  const middle = virtualWindow(5000, 84, 480, 2500 * 84);
  assert.ok(middle.start <= 2500 && middle.end > 2500);
  assert.ok(middle.end - middle.start <= 13);
  const end = virtualWindow(5000, 84, 480, 420000 - 480);
  assert.equal(end.end, 5000);
});

test('window calculations clamp empty lists and overscroll', () => {
  assert.deepEqual(virtualWindow(0, 84, 480, 0), { start: 0, end: 0, total: 0 });
  assert.equal(virtualWindow(2, 84, 480, -100).start, 0);
  assert.deepEqual(virtualWindow(2, 84, 480, 100000), { start: 2, end: 2, total: 168 });
});
