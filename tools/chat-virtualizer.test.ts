import test from 'node:test';
import assert from 'node:assert/strict';
import { Virtualizer, measureElement } from '@tanstack/vue-virtual';
import { chatViewportRect, measureChatElement, observeChatRect } from '../src/features/sessions/virtualMeasurements.ts';

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
