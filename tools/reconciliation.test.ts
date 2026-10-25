import test from 'node:test';
import assert from 'node:assert/strict';
import { createReconciliation } from '../src/core/state/reconciliation.ts';

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('continuous notifications cannot postpone reconciliation indefinitely', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0;
  const c = createReconciliation({ run: async () => { calls++; }, ready: () => true, delayMs: 250, pollMs: 5000 });
  c.start();
  try {
    for (let i = 0; i < 5; i++) { c.request(); t.mock.timers.tick(50); }
    await flush();
    assert.equal(calls, 1);
  } finally { c.stop(); }
});

test('notifications during an in-flight read cause exactly one follow-up read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const pending = deferred();
  let calls = 0;
  const c = createReconciliation({ run: async () => { calls++; if (calls === 1) await pending.promise; }, ready: () => true, delayMs: 250, pollMs: 5000 });
  c.start();
  try {
    c.request(); t.mock.timers.tick(250);
    for (let i = 0; i < 30; i++) c.request();
    t.mock.timers.tick(250);
    assert.equal(calls, 1);
    pending.resolve(); await flush(); t.mock.timers.tick(250); await flush();
    assert.equal(calls, 2);
  } finally { c.stop(); }
});

test('initial loading gates reconciliation without a repeating readiness timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let ready = false, calls = 0;
  const c = createReconciliation({ run: async () => { calls++; }, ready: () => ready, delayMs: 250, pollMs: 5000 });
  c.start();
  try {
    c.request(); t.mock.timers.tick(2000); await flush();
    assert.equal(calls, 0);
    ready = true; c.request(); t.mock.timers.tick(250); await flush();
    assert.equal(calls, 1);
  } finally { c.stop(); }
});

test('an old session completion cannot unlock a new session read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const first = deferred(), second = deferred();
  let calls = 0;
  const c = createReconciliation({ run: async () => { calls++; await (calls === 1 ? first : second).promise; }, ready: () => true, delayMs: 250, pollMs: 5000 });
  c.start();
  try {
    c.request(); t.mock.timers.tick(250);
    c.start(); c.request(); t.mock.timers.tick(250);
    first.resolve(); await flush();
    c.request(); t.mock.timers.tick(250);
    assert.equal(calls, 2, 'new read still owns the single-flight slot');
    c.stop(); second.resolve(); await flush(); t.mock.timers.tick(10000);
    assert.equal(calls, 2, 'stopped sessions cannot restart from a stale finalizer');
  } finally { c.stop(); }
});
