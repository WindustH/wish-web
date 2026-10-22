import test from 'node:test';
import assert from 'node:assert/strict';
import { Virtualizer, measureElement } from '@tanstack/vue-virtual';
import { chatViewportRect, measureChatElement, observeChatRect, refreshChatViewport } from '../src/features/sessions/virtualMeasurements.ts';

function setup() {
  const viewport = { isConnected: true, offsetWidth: 736, offsetHeight: 400, scrollHeight: 1000, clientHeight: 400 };
  const v = new Virtualizer<HTMLElement, Element>({
    count: 10, estimateSize: () => 100, getItemKey: i => `row-${i}`,
    getScrollElement: () => viewport as unknown as HTMLElement,
    observeElementRect: () => () => {}, observeElementOffset: () => () => {}, scrollToFn: () => {},
  });
  v.scrollElement = viewport as unknown as HTMLElement;
  v.scrollRect = { width: 736, height: 400 };
  v.getTotalSize();
  const row = { isConnected: true, offsetHeight: 100, getAttribute: () => '0' };
  return { v, viewport, rowBox: row, row: row as unknown as HTMLElement };
}

test('a visible row recovers from a cached zero without waiting for new output', () => {
  const { v, row } = setup();
  v.resizeItem(0, 0);
  assert.equal(measureElement(row, undefined, v), 0, 'the default remount measurement reuses the poisoned cache');
  v.resizeItem(0, measureChatElement(row, undefined, v));
  assert.equal(v.getTotalSize(), 1000);
  assert.equal(v.itemSizeCache.get('row-0'), 100);
});

test('connected but hidden content never poisons a message height with zero', () => {
  const { v, viewport, row, rowBox } = setup();
  viewport.offsetHeight = 0;
  rowBox.offsetHeight = 0;
  assert.equal(measureChatElement(row, undefined, v), 100);
  v.resizeItem(0, 80);
  assert.equal(measureChatElement(row, undefined, v), 80);
  assert.equal(chatViewportRect(viewport as unknown as HTMLElement), null);
});

test('zero-height chips stay zero instead of creating space in the transcript', () => {
  const { v, row, rowBox } = setup();
  v.setOptions({ ...v.options, estimateSize: () => 0 });
  rowBox.offsetHeight = 0;
  assert.equal(measureChatElement(row, undefined, v), 0);
});

test('a stale zero viewport observation reads current geometry instead of blanking the list', () => {
  const { v, viewport } = setup();
  let resize!: (entries: unknown[]) => void;
  class Observer {
    constructor(callback: typeof resize) { resize = callback; }
    observe() {}
    unobserve() {}
  }
  v.targetWindow = { ResizeObserver: Observer } as unknown as NonNullable<typeof v.targetWindow>;
  const stop = observeChatRect(v, rect => { v.scrollRect = rect; });
  try {
    resize([{ borderBoxSize: [{ inlineSize: 0, blockSize: 0 }] }]);
    assert.equal(v.scrollRect?.height, 400);
    assert.ok(v.getVirtualItems().length > 0);
    viewport.offsetHeight = 0;
    resize([{ borderBoxSize: [{ inlineSize: 0, blockSize: 0 }] }]);
    assert.equal(v.scrollRect?.height, 400, 'a hidden observation keeps the last useful viewport');
  } finally { stop?.(); }
});

test('dragging the window size preserves measured message heights and the visible range', () => {
  const { v, viewport } = setup();
  v.resizeItem(0, 900); // a picture or long reply, much taller than its first estimate
  v.scrollOffset = 500;
  const before = v.getVirtualItems().map(item => item.key);
  for (let frame = 0; frame < 30; frame++) {
    viewport.offsetWidth = 736 - frame;
    viewport.offsetHeight = 400 + frame;
    refreshChatViewport(v);
    assert.equal(v.itemSizeCache.get('row-0'), 900);
    assert.equal(v.getTotalSize(), 1800);
    const visible = v.getVirtualItems().map(item => item.key);
    assert.equal(visible[0], before[0], 'the first row stays anchored as the viewport grows');
    assert.ok(before.every(key => visible.includes(key)), 'growing the viewport retains rows already on screen');
  }
  refreshChatViewport(v, true);
  assert.equal(v.itemSizeCache.size, 0, 'activation can still discard a previous session or hidden layout');
});

test('a recycled message measures its current wrapping instead of keeping an old width cache', () => {
  const { v, row, rowBox } = setup();
  v.resizeItem(0, 320);
  rowBox.offsetHeight = 180;
  assert.equal(measureElement(row, undefined, v), 320);
  v.resizeItem(0, measureChatElement(row, undefined, v));
  assert.equal(v.itemSizeCache.get('row-0'), 180);
});
