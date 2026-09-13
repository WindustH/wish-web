// Unit test for the navigation deadline (#freeze-family): the route guard
// used to await fade() directly, and a never-dispatching WAAPI event stream
// (occluded window / stalled compositor) hung every navigation forever.
// The stubbed never-resolving fade below is exactly that state; navigation
// must still complete via the deadline. Runs with `npm run test`
// (node --test); imports the TS source via node's built-in type stripping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationDeadline } from '../src/ui/motion/navDeadline.ts';

test('navigation completes via the deadline when the fade never resolves', async () => {
  const never = new Promise(() => {});            // WAAPI events never dispatch
  let navigated = false;
  const guard = async () => {
    await navigationDeadline(never, 50);          // the fixed guard awaits this
    navigated = true;                             // …then the route resolves
  };
  const watchdog = new Promise((_, reject) => setTimeout(() => reject(new Error('navigation hung')), 2000));
  await Promise.race([guard(), watchdog]);
  assert.equal(navigated, true);
});

test('a fade that finishes in time still decides the await (visual preserved)', async () => {
  const fade = new Promise(resolve => setTimeout(() => resolve('faded'), 20));
  const started = Date.now();
  const result = await navigationDeadline(fade, 500);
  assert.equal(result, 'faded');
  assert.ok(Date.now() - started < 400, 'deadline must not cut short a timely fade');
});
