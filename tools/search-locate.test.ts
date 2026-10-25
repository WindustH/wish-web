import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, shallowRef } from 'vue';
import { useSearchLocate } from '../src/features/sessions/useSearchLocate.ts';

test('a superseded search cannot scroll or clear the newer target after expansion', async t => {
  const frames: FrameRequestCallback[] = [];
  t.mock.method(globalThis, 'setTimeout', (() => 1) as any);
  const previousFrame = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (f: FrameRequestCallback) => { frames.push(f); return frames.length; } });
  let scrolled = 0;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => ({
    scrollIntoView: () => { scrolled++; }, classList: { contains: () => true },
  }) } });
  const scope = effectScope();
  try {
    const sessionId = shallowRef<string | null>('a'), pendingSeq = shallowRef<number | null>(null);
    const history = { sessionId, pendingSeq, clearPendingSeq: () => { pendingSeq.value = null; } };
    const groups = shallowRef([{ type: 'chips', key: 'host', chips: [{ type: 'process', key: 'run', steps: [{ kind: 'entry', entry: { seq: 1 }, key: 'e1' }] }] }]);
    let following = true;
    scope.run(() => useSearchLocate(history, groups, shallowRef({ scrollToIndex() {} }) as any, () => true, () => 0, () => { following = false; }));
    pendingSeq.value = 1;
    await nextTick(); await nextTick();
    assert.equal(following, false, 'search releases streaming follow before awaiting layout');
    assert.equal(frames.length, 1);
    pendingSeq.value = 2;
    await nextTick();
    const afterSecondSearch = scrolled;
    frames.shift()!(0);
    await nextTick(); await nextTick();
    assert.equal(scrolled, afterSecondSearch, 'old search must not scroll after its awaited frame');
  } finally {
    scope.stop();
    if (previousFrame) Object.defineProperty(globalThis, 'requestAnimationFrame', previousFrame);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
