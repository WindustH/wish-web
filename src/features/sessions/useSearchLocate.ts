import { ref, watch, onUnmounted, nextTick, type Ref } from 'vue';
import { chat } from '../../core/state/chatSlice.ts';
import type { Virtualizer } from '@tanstack/vue-virtual';
import { stepSeq } from './entries/processDetails.ts';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

export function useSearchLocate(
  groups: Ref<any[]>,
  virtualizer: Ref<Virtualizer<HTMLElement, Element>>,
  owns: (gen: number) => boolean,
  getEpoch: () => number,
  onLocated: (toward: 'history') => void,
) {
  const targetSeq = ref<number | null>(null);
  const forcedOpen = ref(new Set<string>());
  let targetTimer: ReturnType<typeof setTimeout> | null = null;

  // The buttons a row carries: those beside a reply's words, or a row of them.
  const chipsOf = (g: any): any[] => g.type === 'chips' ? g.chips : g.before ?? [];
  const holds = (g: any, seq: number): boolean =>
    (g.type === 'entry' && g.entry?.seq === seq)
    || (g.type === 'process' && (g.steps ?? []).some((st: any) => stepSeq(st) === seq))
    || chipsOf(g).some(chip => holds(chip, seq));
  const groupIndexOf = (seq: number) => groups.value.findIndex((g: any) => holds(g, seq));

  watch(() => chat.sessionId.value, () => {
    forcedOpen.value = new Set();
  });

  watch(() => chat.pendingSeq.value, async (seq) => {
    if (seq == null) return;
    const gen = getEpoch();
    const sessionAtStart = chat.sessionId.value;
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!owns(gen) || chat.sessionId.value !== sessionAtStart) return;
      // A step shows in its run's window, outside the log.
      const node = document.querySelector(`[data-seq="${seq}"]`) as HTMLElement | null;
      if (!node) {
        const idx = groupIndexOf(seq);
        if (idx < 0) break;
        const group = groups.value[idx]!;
        forcedOpen.value.add(group.key);
        // The run of steps that holds it opens its window.
        for (const chip of chipsOf(group)) if (holds(chip, seq)) forcedOpen.value.add(chip.key);
        virtualizer.value.scrollToIndex(idx, { align: 'center' });
        await nextTick();
        await nextFrame();
        continue;
      }
      node.scrollIntoView({ block: 'center' });
      targetSeq.value = seq;
      if (targetTimer) clearTimeout(targetTimer);
      targetTimer = setTimeout(() => { targetSeq.value = null; }, 4000);
      chat.clearPendingSeq();
      forcedOpen.value = new Set();
      onLocated('history');
      return;
    }
    if (owns(gen)) chat.clearPendingSeq();
  });

  onUnmounted(() => {
    if (targetTimer) clearTimeout(targetTimer);
  });

  return { targetSeq, forcedOpen };
}
