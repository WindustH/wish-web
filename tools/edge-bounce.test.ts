import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { bounceVelocity, useEdgeBounce } from '../src/features/sessions/useEdgeBounce.ts';

// A list, a frame clock, and the events a browser would send it.
async function withList(run: (list: {
  scrollTo: (top: number, byUser?: boolean) => void;
  wheel: (deltaY: number) => void;
  touch: (y: number) => void;
  touchStart: (y: number) => void;
  tick: (frames?: number) => void;
  offset: () => number;
  translate: () => string;
}) => void) {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let id = 0, now = 1000;
  const pending = new Map<number, FrameRequestCallback>();
  globalThis.requestAnimationFrame = callback => { pending.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = handle => { pending.delete(handle); };
  const listeners = new Map<string, (event: unknown) => void>();
  const el = {
    scrollTop: 600, scrollHeight: 2000, clientHeight: 500,
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const content = { style: { translate: '' } };
  const scope = effectScope();
  scope.run(() => useEdgeBounce(ref(el as unknown as HTMLElement), ref(content as unknown as HTMLElement), ref(true), ref('s')));
  await nextTick();
  const fire = (type: string, event: object = {}) => listeners.get(type)?.({ timeStamp: now, ...event });
  try {
    run({
      scrollTo: (top, byUser = true) => {
        if (byUser) fire('wheel', { deltaY: Math.sign(top - el.scrollTop) });
        el.scrollTop = top;
        fire('scroll');
      },
      wheel: deltaY => fire('wheel', { deltaY }),
      touch: y => fire('touchmove', { touches: [{ clientY: y }] }),
      touchStart: y => fire('touchstart', { touches: [{ clientY: y }] }),
      tick: (frames = 1) => {
        for (let i = 0; i < frames; i++) {
          now += 16;
          const callbacks = [...pending.values()];
          pending.clear();
          callbacks.forEach(callback => callback(now));
        }
      },
      offset: () => Number(content.style.translate.match(/-?[\d.]+(?=px)/)?.[0] || 0),
      translate: () => content.style.translate,
    });
  } finally {
    scope.stop();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  }
}

// Scroll toward the top in steps of `step` px per frame until it arrives.
function arriveAtTop(list: Parameters<Parameters<typeof withList>[0]>[0], step: number) {
  for (let top = 600 - step; top > 0; top -= step) { list.scrollTo(top); list.tick(); }
  list.scrollTo(0);
}

test('the bounce grows with the speed of arrival, up to a limit', () => {
  assert.equal(bounceVelocity(100), 0, 'a slow arrival just stops');
  assert.ok(bounceVelocity(1000) < bounceVelocity(2000));
  assert.equal(bounceVelocity(50_000), bounceVelocity(100_000));
});

test('arriving at the top overshoots by the speed it carried, then settles', () => withList(list => {
  arriveAtTop(list, 40);
  const samples = [];
  for (let i = 0; i < 100; i++) { list.tick(); samples.push(list.offset()); }
  const peak = Math.max(...samples);
  assert.ok(peak > 20 && peak <= 64, `a visible, bounded overshoot (${peak.toFixed(1)}px)`);
  assert.equal(list.translate(), '', 'it settles back');
}));

test('pushing on toward the end changes nothing; scrolling back cuts it short', () => withList(list => {
  arriveAtTop(list, 40);
  list.tick(3);
  const during = list.offset();
  list.wheel(-30);
  list.touch(500); list.touch(540); // a finger pulling down: toward the top
  list.tick();
  assert.ok(list.offset() > 0 && Math.abs(list.offset() - during) < 6, 'the animation goes on as it was');
  list.wheel(40);
  assert.equal(list.translate(), '', 'the other way ends it at once');
}));

test('a finger moving away from the end cuts it short too', () => withList(list => {
  arriveAtTop(list, 40);
  list.tick(3);
  list.touch(500);
  list.touch(470);
  assert.equal(list.translate(), '');
}));

test('the app moving the list to an end does not bounce, nor does a slow arrival', () => withList(list => {
  list.tick(20); // long after any input
  list.scrollTo(1500, false);
  list.tick(10);
  assert.equal(list.translate(), '', 'following new output to the bottom');
  list.scrollTo(20, false);
  list.tick(20);
  for (let top = 19; top >= 0; top -= 1) { list.scrollTo(top); list.tick(); }
  list.tick(5);
  assert.equal(list.translate(), '', 'creeping into the top');
}));

test('arriving at the bottom bounces the other way', () => withList(list => {
  for (let top = 640; top < 1500; top += 50) { list.scrollTo(top); list.tick(); }
  list.scrollTo(1500);
  list.tick(4);
  assert.ok(list.offset() < -5);
}));

test('the bounce plays out over most of a second', () => withList(list => {
  arriveAtTop(list, 40);
  list.tick(30);
  assert.ok(Math.abs(list.offset()) > 0.5, 'still moving after half a second');
  list.tick(80);
  assert.equal(list.translate(), '');
}));

test('a hard push arriving slowly still bounces by the force it carried', () => withList(list => {
  list.scrollTo(3, false);
  list.tick(20);
  list.wheel(-100);   // a notch asks for 100px, the list has only 3 left
  list.scrollTo(0, false);
  list.tick(4);
  assert.ok(list.offset() > 8, `the force shows (${list.offset().toFixed(1)}px)`);
}));

test('at a resting end a shove bounces by its force; nudges and fading momentum do not', () => withList(list => {
  arriveAtTop(list, 40);
  // The momentum after arriving fades out during and after the bounce.
  for (let i = 0; i < 70; i++) { list.wheel(-30 * Math.exp(-i / 15)); list.tick(); }
  assert.equal(list.translate(), '', 'fading momentum does not bounce again');
  list.tick(20);
  list.wheel(-4);
  list.tick(3);
  assert.equal(list.translate(), '', 'a nudge does nothing');
  list.tick(20);
  list.wheel(-20);
  list.tick(3);
  const gentle = list.offset();
  assert.ok(gentle > 3, 'a shove bounces');
  list.tick(110);
  list.wheel(-100);
  list.tick(3);
  assert.ok(list.offset() > gentle, 'a harder shove bounces further');
}));

test('a steady stream of shoves bounces once, and a new swipe during momentum bounces again', () => withList(list => {
  list.scrollTo(0, false);
  list.tick(20);
  for (let i = 0; i < 80; i++) { list.wheel(-40); list.tick(); }
  list.tick(5);
  assert.equal(list.translate(), '', 'one bounce for the whole stream');
  for (let i = 0; i < 10; i++) { list.wheel(-40 * Math.exp(-i / 4)); list.tick(); }
  list.wheel(-60);
  list.tick(3);
  assert.ok(list.offset() > 3);
}));

test('a finger shoving at a resting end bounces once per gesture', () => withList(list => {
  list.scrollTo(0, false);
  list.tick(20);
  list.touchStart(400);
  list.tick();
  list.touch(402);
  list.tick(3);
  assert.equal(list.translate(), '', 'a slow pull does nothing');
  list.touch(404);
  list.tick();
  list.touch(440);
  list.tick(3);
  assert.ok(list.offset() > 3, 'a quick pull bounces');
  list.tick(110);
  list.touch(480);
  list.tick(3);
  assert.equal(list.translate(), '', 'not twice in one gesture');
}));
