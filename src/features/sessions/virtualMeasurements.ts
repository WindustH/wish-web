import { measureElement, observeElementRect, type Virtualizer } from '@tanstack/vue-virtual';

type ChatVirtualizer = Virtualizer<HTMLElement, Element>;

export function chatViewportRect(element: HTMLElement | null) {
  if (!element?.isConnected || element.offsetWidth <= 0 || element.offsetHeight <= 0) return null;
  return { width: element.offsetWidth, height: element.offsetHeight };
}

// ResizeObserver records can describe the hidden/detached layout from before activation.
// Read the box now; a late zero record must not erase a visible viewport's range.
export function observeChatRect(instance: ChatVirtualizer, notify: (rect: { width: number; height: number }) => void) {
  return observeElementRect(instance, () => {
    const rect = chatViewportRect(instance.scrollElement);
    if (rect) notify(rect);
  });
}

// The default measurer reuses a cached size when no observer entry is supplied. Once a
// hidden row has been cached as zero, mounting it again therefore keeps returning zero
// until another resize (often the next model response) arrives. Measure visible rows now,
// and retain their estimate/previous positive size while hidden. Chips really may be zero.
export function measureChatElement(element: Element, entry: ResizeObserverEntry | undefined, instance: ChatVirtualizer): number {
  const index = instance.indexFromElement(element);
  const estimate = instance.options.estimateSize(index);
  const cached = instance.itemSizeCache.get(instance.options.getItemKey(index));
  const fallback = cached != null && cached > 0 ? cached : estimate;
  if (!element.isConnected || !chatViewportRect(instance.scrollElement)) return fallback;
  const height = measureElement(element, entry, instance);
  return height > 0 || estimate === 0 ? height : (element as HTMLElement).offsetHeight || fallback;
}
