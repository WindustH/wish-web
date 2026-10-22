import test from 'node:test';
import assert from 'node:assert/strict';
import { clearRecentsTransition, paintRecentsTransition } from '../src/features/sessions/recentsTransition.ts';

function element() {
  // The transition must work with completely different rows, including a folder-only page.
  // Accessing individual rows would bring back the old shared-row alignment assumption.
  return {
    style: { visibility: '', opacity: '', transform: '', willChange: '' },
    inert: false,
    querySelector() { throw new Error('the transition must not depend on matching conversation rows'); },
  } as unknown as HTMLElement;
}

test('the full-list surface fades with its contents instead of painting an opaque block', () => {
  const pane = element(), page = element();
  paintRecentsTransition(pane, page, 0, true);
  assert.equal(pane.style.opacity, '0', 'the panel background is invisible at the start too');
  assert.equal(page.style.opacity, '1');
  paintRecentsTransition(pane, page, .5, true);
  assert.equal(pane.style.opacity, '0.5');
  assert.equal(page.style.opacity, '0.5');
  assert.equal(pane.style.transform, 'translateY(12px)');
  assert.equal(pane.style.visibility, 'visible');
  assert.equal(page.style.visibility, 'visible');
});

test('opening and closing leave only the resting view interactive, with no faded styles left', () => {
  const pane = element(), page = element();
  paintRecentsTransition(pane, page, .4, true);
  paintRecentsTransition(pane, page, 1, false);
  assert.equal(pane.style.visibility, 'visible');
  assert.equal(pane.inert, false);
  assert.equal(page.style.visibility, 'hidden');
  assert.equal(page.inert, true);
  assert.equal(pane.style.opacity, '');
  assert.equal(pane.style.transform, '');
  assert.equal(page.style.opacity, '');
  paintRecentsTransition(pane, page, .6, true);
  paintRecentsTransition(pane, page, 0, false);
  assert.equal(pane.style.visibility, 'hidden');
  assert.equal(pane.inert, true);
  assert.equal(page.style.visibility, 'visible');
  assert.equal(page.inert, false);
  assert.equal(page.style.opacity, '');
});

test('reversing an unfinished transition uses the same path for unrelated list contents', () => {
  const pane = element(), page = element();
  for (const progress of [0, .2, .7, .4, .1, 0]) {
    paintRecentsTransition(pane, page, progress, true);
    assert.ok(Math.abs(Number(pane.style.opacity) + Number(page.style.opacity) - 1) < 1e-9);
    const lift = Number(pane.style.transform.match(/[\d.]+/)![0]);
    assert.ok(lift >= 0 && lift <= 24, 'the whole view only rises a little, whatever its folders contain');
  }
});

test('leaving mid-transition clears opacity and inert state for other routes or desktop layout', () => {
  const pane = element(), page = element();
  paintRecentsTransition(pane, page, .8, true);
  clearRecentsTransition(pane, page);
  for (const node of [pane, page]) {
    assert.equal(node.style.opacity, '');
    assert.equal(node.style.transform, '');
    assert.equal(node.style.visibility, '');
    assert.equal(node.style.willChange, '');
    assert.equal(node.inert, false);
  }
});
