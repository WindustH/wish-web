// Unit test for the vendored @tanstack/virtual-core patch (freeze family #6):
// a clamped scroll adjustment that could not be re-issued before the page
// was KeepAlive-detached used to survive indefinitely and replay its stale
// target on the return visit, yanking the reader to a pre-leave position.
// The patch stamps the entry with `at` and _retryClampedAdjustment drops
// anything older than 1s. Imports the installed dist directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// pnpm stores patched instances under a content-hashed directory; resolve it
// by prefix so the canary survives re-installations and patch rehashes.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmDir = join(repoRoot, 'node_modules', '.pnpm');
const virtualCoreDist = join(
  pnpmDir,
  readdirSync(pnpmDir).find((name) => name.startsWith('@tanstack+virtual-core@3.17.9'))!,
  'node_modules', '@tanstack', 'virtual-core', 'dist', 'esm', 'index.js',
);
const { Virtualizer } = await import(virtualCoreDist);

function makeVirtualizer(t?: { offsetCb?: (offset: number) => void }) {
  const el: { scrollHeight: number; clientHeight: number; scrollTop?: number; scrollTo(): void } =
    { scrollHeight: 1000, clientHeight: 400, scrollTo() {} };
  const writes: number[] = [];
  const options = {
    count: 10,
    estimateSize: () => 100,
    getScrollElement: () => el,
    observeElementRect: (_instance: unknown, cb: (rect: { width: number; height: number }) => void) => { cb({ width: 100, height: 400 }); return () => {}; },
    observeElementOffset: (_instance: unknown, cb: (offset: number) => void) => { t!.offsetCb = cb; return () => {}; },
    scrollToFn: (offset: number) => { writes.push(offset); el.scrollTop = offset; },
    initialOffset: 0,
  };
  const v = new Virtualizer(options);
  v.scrollElement = el;
  v.scrollRect = { width: 100, height: 400 };
  writes.length = 0;                             // drop the construction-time write
  return { v, el, writes };
}

test('fresh clamped adjustment retries once the sizer grows', () => {
  const { v, el, writes } = makeVirtualizer();
  v.applyScrollAdjustment(5000);
  assert.ok(v._clampedAdjustment, 'clamp must be stored when target exceeds max');
  writes.length = 0;                            // the clamp itself re-writes the current offset
  el.scrollHeight = 6000;                       // sizer grows (measurements land)
  v._retryClampedAdjustment();
  assert.equal(v._clampedAdjustment, null);
  assert.deepEqual(writes, [5000], 'the intended target must be re-issued');
});

test('a clamped adjustment older than 1s is dropped, never replayed', () => {
  const { v, el, writes } = makeVirtualizer();
  const atWrite = 50_000;
  v.now = () => atWrite;
  v.applyScrollAdjustment(5000);
  assert.ok(v._clampedAdjustment, 'clamp stored at write time');
  writes.length = 0;                            // the clamp itself re-writes the current offset
  v.now = () => atWrite + 1500;                 // KeepAlive detach + return, later
  el.scrollHeight = 6000;                       // even though the sizer "grew"
  v._retryClampedAdjustment();
  assert.equal(v._clampedAdjustment, null, 'stale entry must be cleared');
  assert.deepEqual(writes, [], 'the stale target must NOT be replayed');
});
