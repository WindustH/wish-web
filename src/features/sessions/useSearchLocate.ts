import { ref, watch, onUnmounted, nextTick, type Ref } from 'vue';
import { chat } from '../../core/state/chatSlice.ts';
import type { Virtualizer } from '@tanstack/vue-virtual';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

export function useSearchLocate(
  scrollEl: Ref<HTMLElement | null>,
  groups: Ref<any[]>,
  virtualizer: Ref<Virtualizer<HTMLElement, Element>>,
  owns: (gen: number) => boolean,
  getEpoch: () => number,
  onLocated: (toward: 'history') => void,
) {
  const targetSeq = ref<number | null>(null);
  const forcedOpen = ref(new Set<string>());
  let targetTimer: ReturnType<typeof setTimeout> | null = null;

  const groupIndexOf = (seq: number) =>
    groups.value.findIndex((g: any) =>
      g.type === 'entry'
        ? g.entry?.seq === seq
        : (g.steps ?? []).some((st: any) => st.fromSeq === seq || st.entry?.seq === seq),
    );

  watch(() => chat.sessionId.value, () => {
    forcedOpen.value = new Set();
  });

  watch(() => chat.pendingSeq.value, async (seq) => {
    if (seq == null) return;
    const gen = getEpoch();
    const sessionAtStart = chat.sessionId.value;
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!owns(gen) || chat.sessionId.value !== sessionAtStart) return;
      const el = scrollEl.value;
      const node = el?.querySelector(`[data-seq="${seq}"]`) as HTMLElement | null;
      if (!node) {
        const idx = groupIndexOf(seq);
        if (idx < 0) break;
        forcedOpen.value.add(groups.value[idx]!.key);
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
