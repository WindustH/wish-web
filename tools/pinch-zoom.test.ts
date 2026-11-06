import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { usePinchZoom } from '../src/ui/composables/usePinchZoom.ts';

test('pinch releases one-finger movement before the remaining finger lifts', async () => {
  const scope = effectScope();
  const host = new EventTarget();
  const element = ref<HTMLElement>();
  const updates: number[] = [];
  const pinching = scope.run(() => usePinchZoom(element, ratio => updates.push(ratio)))!;
  const touch = (type: string, points: number[]) => {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      touches: points.map((x, identifier) => ({ identifier, clientX: x, clientY: 0 })),
    });
    host.dispatchEvent(event);
    return event;
  };
  try {
    element.value = host as HTMLElement;
    await nextTick();
    assert.equal(touch('touchmove', [10]).defaultPrevented, false);
    touch('touchstart', [10, 20]);
    assert.equal(pinching.value, true);
    assert.equal(touch('touchmove', [10, 30]).defaultPrevented, true);
    assert.deepEqual(updates, [2]);
    touch('touchend', [10]);
    assert.equal(pinching.value, false);
    assert.equal(touch('touchmove', [15]).defaultPrevented, false);
    assert.deepEqual(updates, [2], 'one finger never changes scale');
    const click = new Event('click', { cancelable: true });
    host.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true, 'pinch compatibility click stays suppressed');
    touch('touchstart', [10, 20]);
    touch('touchcancel', []);
    assert.equal(pinching.value, false);
    touch('touchstart', [10, 20]);
    scope.stop();
    assert.equal(pinching.value, false);
    assert.equal(touch('touchmove', [10, 40]).defaultPrevented, false, 'listeners are released');
  } finally { scope.stop(); }
});
