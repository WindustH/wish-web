import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeDismissalClick } from '../src/ui/consumeDismissalClick.ts';

function click(detail = 1, pointerId = 1) {
  return Object.assign(new Event('click', { cancelable: true }), { detail, pointerId });
}
test('only the dismissing click is consumed; the next gesture answers immediately', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const browser = new EventTarget();
  consumeDismissalClick(browser as Window, 1);
  const dismissed = click();
  browser.dispatchEvent(dismissed);
  assert.equal(dismissed.defaultPrevented, true);
  const next = click();
  browser.dispatchEvent(next);
  assert.equal(next.defaultPrevented, false);
});
test('a missing pointerup or click cannot swallow the next tap or keyboard activation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const browser = new EventTarget();
  consumeDismissalClick(browser as Window, 1);
  const keyboard = click(0);
  browser.dispatchEvent(keyboard);
  assert.equal(keyboard.defaultPrevented, false);
  browser.dispatchEvent(new Event('pointerdown'));
  const next = click();
  browser.dispatchEvent(next);
  assert.equal(next.defaultPrevented, false);
  consumeDismissalClick(browser as Window, 1);
  t.mock.timers.tick(1500);
  const later = click();
  browser.dispatchEvent(later);
  assert.equal(later.defaultPrevented, false);
});
