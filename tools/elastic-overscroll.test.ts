import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, ref } from 'vue';
import { useElasticOverscroll } from '../src/features/sessions/useElasticOverscroll.ts';

test('trackpad momentum yields to the spring and a later gesture responds immediately', () => {
  const originalElement = globalThis.Element;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.Element = class {} as unknown as typeof Element;
  let nextFrame = 0;
  let now = 0;
  const pending = new Map<number, FrameRequestCallback>();
  globalThis.requestAnimationFrame = callback => {
    const id = ++nextFrame;
    pending.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = id => pending.delete(id);

  const content = { style: { translate: '' } };
  const viewport = { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 };
  const scope = effectScope();
  const elastic = scope.run(() => useElasticOverscroll(
    ref(viewport as unknown as HTMLElement), ref(content as unknown as HTMLElement), ref(true), ref('session')))!;
  const offset = () => Number(content.style.translate.match(/-?[\d.]+(?=px)/)?.[0] || 0);
  const tick = () => {
    now += 16;
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach(callback => callback(now));
  };
  const wheelUp = (deltaY: number) => elastic.wheel({ deltaY, deltaX: 0, deltaMode: 0, ctrlKey: false, target: null } as unknown as WheelEvent);

  try {
    const samples = [];
    for (let i = 0; i < 50; i++) {
      wheelUp(-22 * Math.exp(-i / 10));
      tick();
      samples.push(offset());
    }
    assert.ok(Math.max(...samples) > 5, 'wheel motion visibly stretches the content');
    assert.ok(samples[40] < Math.max(...samples) * 0.65, 'spring wins before momentum events stop');
    for (let i = 0; i < 100; i++) tick();
    assert.equal(content.style.translate, '', 'the spring settles at the actual scroll limit');
    wheelUp(-16);
    assert.ok(offset() > 0, 'another outward wheel event responds without a cooldown');
  } finally {
    scope.stop();
    if (originalElement === undefined) delete (globalThis as Partial<typeof globalThis>).Element;
    else globalThis.Element = originalElement;
    if (originalRaf === undefined) delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRaf;
    if (originalCancel === undefined) delete (globalThis as Partial<typeof globalThis>).cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = originalCancel;
  }
});
