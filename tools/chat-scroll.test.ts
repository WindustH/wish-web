import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { computed, effectScope, nextTick, onScopeDispose, shallowRef, type Ref } from 'vue';
import { useChatScroll } from '../src/features/sessions/useChatScroll.ts';
import { chat } from '../src/core/state/chatSlice.ts';
import { groupEntries, inlineChips } from '../src/features/sessions/grouping.ts';
import { estimateRow } from '../src/features/sessions/rowEstimate.ts';

const originalFrame = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
before(() => Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: FrameRequestCallback) => { queueMicrotask(() => callback(performance.now())); return 1; },
}));
after(() => {
  if (originalFrame) Object.defineProperty(globalThis, 'requestAnimationFrame', originalFrame);
  else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
});

// A clamping scroll element, like the browser's. The rail is inside it; the jump button is not.
function setup({ height = 2000, active = shallowRef(true), initialRows = [] }:
  { height?: number; active?: Ref<boolean>; initialRows?: any[] } = {}) {
  const rail = {}, overlay = {};
  let top = Math.max(0, height - 400);
  const el = {
    scrollHeight: height, clientHeight: 400,
    get scrollTop() { return top; },
    set scrollTop(value: number) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
    contains(target: unknown) { return target === rail; },
  };
  const stream = shallowRef({ active: true, text: '' });
  const groups = shallowRef<any[]>(initialRows);
  const scope = effectScope();
  let alive = true;
  const scroll = scope.run(() => {
    onScopeDispose(() => { alive = false; });
    return useChatScroll({
      scrollEl: shallowRef(el as unknown as HTMLElement), groups,
      sessionId: shallowRef('scroll-regression'), pageActive: active,
      running: computed(() => stream.value.active), streamState: stream,
      owns: () => alive, getEpoch: () => 0,
    });
  })!;
  return { el, rail, overlay, stream, groups, scope, scroll };
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

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 1));
    if (check()) return;
  }
  assert.ok(check(), 'history pagination did not complete');
};

test('a tool-only tail loads older pages without needing a native scroll event', async t => {
  const previous = { entries: chat.entries.value, more: chat.hasMoreBefore.value, initial: chat.loadingInitial.value };
  const toolPage = (start: number) => Array.from({ length: 40 }, (_, i) => ({ seq: start + i, kind: 'assistant_message' as const,
    payload: { content: [{ type: 'tool_call', name: 'shell_edit', id: `call-${start + i}` }] } }));
  chat.entries.value = toolPage(1000) as never;
  chat.hasMoreBefore.value = true;
  chat.loadingInitial.value = false;
  const h = setup({ height: 400 });
  let calls = 0;
  t.after(() => {
    h.scope.stop();
    chat.entries.value = previous.entries;
    chat.hasMoreBefore.value = previous.more;
    chat.loadingInitial.value = previous.initial;
  });
  t.mock.method(chat, 'loadOlder', async ({ beforeMerge }: { beforeMerge: () => Promise<void> }) => {
    await beforeMerge();
    calls++;
    const start = 1000 - calls * 40;
    const page = calls === 16 ? [{ seq: start, kind: 'user_message', payload: { content: [{ type: 'text', text: '较早的正文。'.repeat(300) }] } }]
      : toolPage(start);
    chat.entries.value = [...page, ...chat.entries.value] as never;
    const rows = inlineChips(groupEntries(chat.entries.value));
    h.el.scrollHeight = Math.max(h.el.clientHeight, rows.reduce((sum, row) => sum + estimateRow(row, 736), 64));
    return true;
  });
  await waitFor(() => calls >= 16);
  assert.equal(calls, 16, 'zero-height pages must not hit the ordinary near-top prefetch cap');
  assert.ok(h.el.scrollHeight > h.el.clientHeight, 'the earlier text makes the history scrollable');
  assert.ok(chat.entries.value.some(entry => entry.kind === 'user_message'));
});

test('an unchanged history cursor stops automatic filling but an upward wheel can retry', async t => {
  const previous = { entries: chat.entries.value, more: chat.hasMoreBefore.value, initial: chat.loadingInitial.value };
  chat.entries.value = [{ seq: 40, kind: 'tool_result', payload: {} }] as never;
  chat.hasMoreBefore.value = true;
  chat.loadingInitial.value = false;
  const h = setup({ height: 400 });
  let calls = 0;
  t.after(() => {
    h.scope.stop();
    chat.entries.value = previous.entries;
    chat.hasMoreBefore.value = previous.more;
    chat.loadingInitial.value = previous.initial;
  });
  t.mock.method(chat, 'loadOlder', async () => { calls++; return true; });
  await waitFor(() => calls === 1);
  await h.scroll.ensureHistoryScrollable();
  assert.equal(calls, 1, 'the same cursor must not be fetched indefinitely');
  h.scroll.onWheel({ deltaY: -120, deltaMode: 0, target: h.rail } as unknown as WheelEvent);
  await waitFor(() => calls === 2);
  assert.equal(h.el.scrollTop, 0, 'pagination works even when the browser cannot move scrollTop');
});

test('a failed fill does not retry itself when the error card changes layout', async t => {
  const previous = { entries: chat.entries.value, more: chat.hasMoreBefore.value, initial: chat.loadingInitial.value };
  chat.entries.value = [{ seq: 40, kind: 'tool_result', payload: {} }] as never;
  chat.hasMoreBefore.value = true;
  chat.loadingInitial.value = false;
  const h = setup({ height: 400, initialRows: [{ type: 'chips', key: 'tail', chips: [] }] });
  let calls = 0;
  t.after(() => {
    h.scope.stop();
    chat.entries.value = previous.entries;
    chat.hasMoreBefore.value = previous.more;
    chat.loadingInitial.value = previous.initial;
  });
  t.mock.method(chat, 'loadOlder', async () => { calls++; return false; });
  await waitFor(() => calls === 1);
  h.groups.value = [{ type: 'status_request_error', key: 'error' }];
  await nextTick();
  await h.scroll.ensureHistoryScrollable();
  assert.equal(calls, 1);
  h.scroll.onTouchStart({ touches: [{ clientY: 200 }], target: h.rail } as unknown as TouchEvent);
  h.scroll.onTouchMove({ touches: [{ clientY: 260 }] } as unknown as TouchEvent);
  await waitFor(() => calls === 2);
});

test('filling waits for initial history and stops when the history ends without any text', async t => {
  const previous = { entries: chat.entries.value, more: chat.hasMoreBefore.value, initial: chat.loadingInitial.value };
  chat.entries.value = [{ seq: 40, kind: 'tool_result', payload: {} }] as never;
  chat.hasMoreBefore.value = true;
  chat.loadingInitial.value = true;
  const h = setup({ height: 400 });
  let calls = 0;
  t.after(() => {
    h.scope.stop();
    chat.entries.value = previous.entries;
    chat.hasMoreBefore.value = previous.more;
    chat.loadingInitial.value = previous.initial;
  });
  t.mock.method(chat, 'loadOlder', async () => {
    calls++;
    chat.entries.value = [{ seq: 1, kind: 'tool_result', payload: {} }, ...chat.entries.value] as never;
    chat.hasMoreBefore.value = false;
    return true;
  });
  await h.scroll.ensureHistoryScrollable();
  assert.equal(calls, 0, 'the initial snapshot must settle before pagination');
  chat.loadingInitial.value = false;
  await waitFor(() => calls === 1);
  await h.scroll.ensureHistoryScrollable();
  assert.equal(calls, 1, 'exhausted history must not trigger another fill');
});

test('a hidden page waits until it is active before filling its empty viewport', async t => {
  const previous = { entries: chat.entries.value, more: chat.hasMoreBefore.value, initial: chat.loadingInitial.value };
  chat.entries.value = [{ seq: 40, kind: 'tool_result', payload: {} }] as never;
  chat.hasMoreBefore.value = true;
  chat.loadingInitial.value = false;
  const active = shallowRef(false);
  const h = setup({ height: 400, active });
  let calls = 0;
  t.after(() => {
    h.scope.stop();
    chat.entries.value = previous.entries;
    chat.hasMoreBefore.value = previous.more;
    chat.loadingInitial.value = previous.initial;
  });
  t.mock.method(chat, 'loadOlder', async () => {
    calls++;
    chat.hasMoreBefore.value = false;
    return true;
  });
  await h.scroll.ensureHistoryScrollable();
  assert.equal(calls, 0);
  active.value = true;
  await waitFor(() => calls === 1);
});
