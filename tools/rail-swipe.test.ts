import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, shallowRef } from 'vue';
import { useRailSwipe } from '../src/features/sessions/useRailSwipe.ts';

class Element extends EventTarget {
  style = { transform: '' };
  classes = new Set<string>();
  classList = { toggle: (key: string, on: boolean) => on ? this.classes.add(key) : this.classes.delete(key) };
  closest() { return null; }
  setPointerCapture() {}
  releasePointerCapture() {}
}
function pointer(target: EventTarget, type: string, id = 1, x = 0, primary = true) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: id }, clientX: { value: x }, clientY: { value: 0 },
    isPrimary: { value: primary }, button: { value: 0 },
  });
  target.dispatchEvent(event);
}

test('rail gestures coalesce frames, recover outside releases, cancel multitouch and clean up on disable', async () => {
  const saved = ['window', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const win = new EventTarget();
  Object.assign(win, { setTimeout, clearTimeout });
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: win },
    requestAnimationFrame: { configurable: true, value: (f: FrameRequestCallback) => { frames.set(++id, f); return id; } },
    cancelAnimationFrame: { configurable: true, value: (id: number) => frames.delete(id) },
  });
  const scope = effectScope();
  try {
    const wrap = new Element(), scroll = new Element(), content = new Element();
    const enabled = shallowRef(true);
    const rail = scope.run(() => useRailSwipe({ wrap: shallowRef(wrap as any), scroll: shallowRef(scroll as any), content: shallowRef(content as any), enabled }))!;
    pointer(wrap, 'pointerdown');
    pointer(win, 'pointerup'); // Release outside before capture; next gesture must still work.
    pointer(wrap, 'pointerdown');
    for (const x of [12, 20, 30, 40]) pointer(wrap, 'pointermove', 1, x);
    assert.equal(frames.size, 1, 'many pointer events produce one visual write per frame');
    assert.equal(content.style.transform, '');
    const [frameId, callback] = [...frames][0]!; frames.delete(frameId); callback(0);
    assert.equal(content.style.transform, 'translate3d(40px, 0, 0)');
    pointer(wrap, 'pointerdown', 2, 40, false);
    assert.equal(content.style.transform, 'translate3d(0px, 0, 0)', 'second finger cancels the active drawer');
    pointer(win, 'pointerup', 1); pointer(win, 'pointerup', 2);
    pointer(wrap, 'pointerdown'); pointer(wrap, 'pointermove', 1, 44); pointer(win, 'pointerup', 1, 44);
    assert.equal(rail.open.value, true);
    assert.equal(frames.size, 0, 'settling cancels the queued drag frame');
    enabled.value = false; await nextTick();
    assert.equal(rail.open.value, false);
    assert.equal(content.style.transform, 'translate3d(0px, 0, 0)');
    assert.equal(scroll.classes.size, 0);
  } finally {
    scope.stop();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
