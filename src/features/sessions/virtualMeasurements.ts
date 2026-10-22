import { measureElement, observeElementRect, type Virtualizer } from '@tanstack/vue-virtual';

type ChatVirtualizer = Virtualizer<HTMLElement, Element>;

export function chatViewportRect(element: HTMLElement | null) {
  if (!element?.isConnected || element.offsetWidth <= 0 || element.offsetHeight <= 0) return null;
  return { width: element.offsetWidth, height: element.offsetHeight };
}

// A viewport resize changes the visible range, not the identities or measured heights of all
// its messages. Clearing the cache on every drag frame replaces real heights with estimates,
// repeatedly moving the range to unrelated rows. Mounted rows observe their own size; rows
// coming back into view are measured at their new width below. Only activation/session changes
// need a full reset, to recover measurements taken while the page was hidden.
export function refreshChatViewport(instance: ChatVirtualizer, reset = false) {
  const rect = chatViewportRect(instance.scrollElement);
  if (!rect) return;
  instance.scrollRect = rect;
  if (reset) instance.measure();
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
  // A recycled row may have last been seen at another window width. Without a fresh observer
  // entry the library returns its old cached height; read its mounted box instead.
  const height = entry ? measureElement(element, entry, instance) : (element as HTMLElement).offsetHeight;
  return height > 0 || estimate === 0 ? height : (element as HTMLElement).offsetHeight || fallback;
}
