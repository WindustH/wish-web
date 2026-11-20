import { computed, nextTick, watch, type Ref } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { sourceRange } from '../../ui/sourceSelection.ts';
import type { SourcePages } from './sourcePages.ts';

export function useSourceWindow(
  pages: () => SourcePages | undefined,
  viewport: Ref<HTMLElement | undefined>,
  active: () => boolean,
  onError: (error: unknown) => void,
) {
  const virtual = useVirtualizer(
    computed(() => ({
      count: pages()?.count.value ?? 0,
      getScrollElement: () => viewport.value ?? null,
      estimateSize: (i: number) => (pages()?.blocks[i]?.rows ?? 1) * 22.1,
      overscan: 2,
      useAnimationFrameWithResizeObserver: true,
    })),
  );
  const items = computed(() => virtual.value.getVirtualItems());
  const before = computed(() => items.value[0]?.start ?? 0);
  const after = computed(() => virtual.value.getTotalSize() - (items.value.at(-1)?.end ?? 0));
  watch(
    [pages, items, active],
    async ([doc, rows, visible]) => {
      if (!visible || !doc || !rows.length) return;
      try {
        await Promise.all(rows.map((row) => doc.read(doc.blocks[row.index]!.page)));
        if (rows.at(-1)!.index >= doc.blocks.length - 1 && !doc.complete) await doc.next();
      } catch (error) {
        if (!doc.signal.aborted) onError(error);
      }
    },
    { immediate: true },
  );
  function measure(el: unknown) {
    if (el instanceof HTMLElement) virtual.value.measureElement(el);
  }
  // Restore the byte index only as far as the requested position or quote.
  async function restore(top: number, focus?: { start: number; end: number; text: string }) {
    const doc = pages(),
      el = viewport.value;
    if (!doc || !el) return;
    try {
      while (!doc.complete && (focus ? doc.length < focus.end : virtual.value.getTotalSize() < top + el.clientHeight)) {
        await doc.next();
        await nextTick();
        if (viewport.value !== el || doc.signal.aborted) return;
      }
      if (!focus) {
        el.scrollTop = top;
        return;
      }
      const find = (offset: number) => doc.blocks.findLastIndex((block) => block.offset <= offset);
      const first = find(focus.start),
        last = find(Math.max(focus.start, focus.end - 1));
      if (first < 0 || last < 0) return;
      await Promise.all(doc.blocks.slice(first, last + 1).map((b) => doc.read(b.page)));
      if (viewport.value !== el || doc.signal.aborted) return;
      virtual.value.scrollToIndex(first, { align: 'start' });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const locate = (index: number, pos: number) => {
        const block = el.querySelector<HTMLElement>(`[data-index="${index}"]`);
        const local = pos - doc.blocks[index]!.offset;
        return block && sourceRange(block, local, local);
      };
      const range = locate(first, focus.start),
        end = locate(last, focus.end);
      if (!range || !end) return;
      range.setEnd(end.endContainer, end.endOffset);
      if (range.toString() !== focus.text) return;
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      el.scrollTop += range.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 3;
    } catch (error) {
      if (!doc.signal.aborted) onError(error);
    }
  }
  return { items, before, after, measure, restore };
}
