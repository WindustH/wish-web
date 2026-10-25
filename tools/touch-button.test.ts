import test from 'node:test';
import assert from 'node:assert/strict';
import { touchButton } from '../src/ui/touchButton.ts';

test('touch buttons activate a tap once and leave drags, holds, cancellation and multitouch alone', () => {
  let clicks = 0, prevented = 0;
  const button = { isConnected: true, click: () => clicks++, contains: (hit: unknown) => hit === button,
    ownerDocument: { elementFromPoint: () => button } };
  const gesture = touchButton();
  const event = (x = 0, time = 0, end = false) => ({ currentTarget: button, timeStamp: time, cancelable: true,
    touches: end ? [] : [{ identifier: 1, clientX: x, clientY: 0 }],
    changedTouches: [{ identifier: 1, clientX: x, clientY: 0 }], preventDefault: () => prevented++ } as unknown as TouchEvent);
  gesture.start(event()); gesture.end(event(2, 100, true)); gesture.end(event(2, 100, true));
  assert.equal(clicks, 1); assert.equal(prevented, 1);
  gesture.start(event()); gesture.move(event(20)); gesture.end(event(0, 100, true));
  gesture.start(event()); gesture.end(event(0, 600, true));
  gesture.start(event()); gesture.cancel(); gesture.end(event(0, 100, true));
  gesture.start(event()); gesture.move({ touches: [{}, {}] } as unknown as TouchEvent); gesture.end(event(0, 100, true));
  gesture.start(event()); button.isConnected = false; gesture.end(event(0, 100, true));
  assert.equal(clicks, 1); assert.equal(prevented, 1);
});
