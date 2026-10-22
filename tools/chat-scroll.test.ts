import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, effectScope, nextTick, shallowRef } from 'vue';
import { useChatScroll } from '../src/features/sessions/useChatScroll.ts';

// A clamping scroll element, like the browser's. The rail is inside it; the jump button is not.
function setup() {
  const rail = {}, overlay = {};
  let top = 1600;
  const el = {
    scrollHeight: 2000, clientHeight: 400,
    get scrollTop() { return top; },
    set scrollTop(value: number) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
    contains(target: unknown) { return target === rail; },
  };
  const stream = shallowRef({ active: true, text: '' });
  const scope = effectScope();
  const scroll = scope.run(() => useChatScroll({
    scrollEl: shallowRef(el as unknown as HTMLElement), groups: shallowRef([]),
    sessionId: shallowRef('scroll-regression'), pageActive: shallowRef(true),
    running: computed(() => stream.value.active), streamState: stream,
    owns: () => true, getEpoch: () => 0,
  }))!;
  return { el, rail, overlay, stream, scope, scroll };
}

test('wheeling up over the rail escapes pending stream-follow writes', async () => {
  const h = setup();
  try {
    h.stream.value = { active: true, text: 'more output' };
    h.scroll.onWheel({ deltaY: -120, deltaMode: 0, target: h.rail } as unknown as WheelEvent);
    h.el.scrollTop -= 120; // Native scrolling: the rail shares the log's ancestors.
    await nextTick(); await nextTick();
    assert.equal(h.scroll.stick.value, false);
    assert.equal(h.el.scrollTop, 1480, 'a queued stream update must not pin the reader to the tail');
    h.el.scrollHeight += 100;
    h.stream.value = { active: true, text: 'still working' };
    await nextTick(); await nextTick();
    assert.equal(h.el.scrollTop, 1480, 'continued output must respect the reader browsing history');
  } finally { h.scope.stop(); }
});

test('wheel fallback over an overlay scrolls the log and resumes follow only at the bottom', async () => {
  const h = setup();
  try {
    h.scroll.onWheel({ deltaY: -120, deltaMode: 0, target: h.overlay } as unknown as WheelEvent);
    assert.equal(h.el.scrollTop, 1480);
    h.scroll.onScroll();
    assert.equal(h.scroll.stick.value, false);
    h.scroll.onWheel({ deltaY: 500, deltaMode: 0, target: h.overlay } as unknown as WheelEvent);
    h.scroll.onScroll();
    assert.equal(h.scroll.stick.value, true);
    h.el.scrollHeight += 100;
    h.stream.value = { active: true, text: 'new output' };
    await nextTick(); await nextTick();
    assert.equal(h.el.scrollTop, 1700);
  } finally { h.scope.stop(); }
});

test('a vertical touch over the rail releases follow before streamed output lands', async () => {
  const h = setup();
  try {
    h.stream.value = { active: true, text: 'more output' };
    h.scroll.onTouchStart({ touches: [{ clientY: 200 }], target: h.rail } as unknown as TouchEvent);
    h.scroll.onTouchMove({ touches: [{ clientY: 280 }] } as unknown as TouchEvent);
    h.el.scrollTop -= 80;
    h.scroll.onTouchEnd();
    await nextTick(); await nextTick();
    assert.equal(h.scroll.stick.value, false);
    assert.equal(h.el.scrollTop, 1520);
  } finally { h.scope.stop(); }
});
