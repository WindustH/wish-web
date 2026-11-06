import { ref, watch, onScopeDispose, nextTick, type Ref } from 'vue';
import type { ChatApi } from '../../core/state/chatSlice.ts';
import type { Virtualizer } from '@tanstack/vue-virtual';
import { stepSeq } from './entries/processDetails.ts';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

export function useSearchLocate(
  chat: Pick<ChatApi, 'sessionId' | 'pendingSeq' | 'clearPendingSeq'>,
  groups: Ref<any[]>,
  virtualizer: Ref<Virtualizer<HTMLElement, Element>>,
  owns: (gen: number) => boolean,
  getEpoch: () => number,
  onLocated: (toward: 'history') => void,
  sourceSeq: () => number | undefined = () => undefined,
) {
  const targetSeq = ref<number | null>(null);
  const forcedOpen = ref(new Set<string>());
  let targetTimer: ReturnType<typeof setTimeout> | null = null;

  // The buttons a row carries: those beside a reply's words, or a row of them.
  const chipsOf = (g: any): any[] =>
    g.type === 'chips'
      ? g.chips
      : g.type === 'image_album'
        ? g.items.flatMap((item: any) => item.before ?? [])
        : (g.before ?? []);
  const holds = (g: any, seq: number): boolean =>
    ((g.type === 'entry' || g.type === 'question') && g.entry?.seq === seq) ||
    (g.type === 'question' && g.result?.seq === seq) ||
    (g.type === 'image_album' && g.items.some((item: any) => holds(item, seq))) ||
    (g.type === 'process' && (g.steps ?? []).some((st: any) => stepSeq(st) === seq)) ||
    chipsOf(g).some((chip) => holds(chip, seq));
  const groupIndexOf = (seq: number) => groups.value.findIndex((g: any) => holds(g, seq));

  watch(
    () => chat.sessionId.value,
    () => {
      forcedOpen.value = new Set();
      targetSeq.value = null;
      if (targetTimer) clearTimeout(targetTimer);
    },
  );

  watch(
    () => chat.pendingSeq.value,
    async (seq, _, cleanup) => {
      let cancelled = false;
      cleanup(() => {
        cancelled = true;
      });
      if (seq == null) return;
      const gen = getEpoch();
      const sessionAtStart = chat.sessionId.value;
      const current = () =>
        !cancelled && owns(gen) && chat.sessionId.value === sessionAtStart && chat.pendingSeq.value === seq;
      // Release tail-follow before any asynchronous expansion or scroll write.
      onLocated('history');
      for (let attempt = 0; attempt < 10; attempt++) {
        if (!current()) return;
        // The run or notice that holds it opens its window: a step shows there, outside the log, and a
        // result with its call.
        const idx = groupIndexOf(seq);
        const opening =
          idx < 0
            ? []
            : chipsOf(groups.value[idx]).filter((chip) => holds(chip, seq) && !forcedOpen.value.has(chip.key));
        if (opening.length) {
          for (const chip of opening) forcedOpen.value.add(chip.key);
          await nextTick();
          await nextFrame();
        }
        if (!current()) return;
        // A step's seq is the seq of the entry its block came from, so the reply's own anchor
        // carries it too - and as an ancestor it answers a plain query first. Ask for the step
        // itself: in an open process window first, then on the rail, then a notice's host; the
        // reply's anchor only if nothing inner holds it. (The same session's windows are the only
        // others in the document that can match, and they hold their own steps, not this reply's.)
        const hold = (selector: string) =>
          document.querySelector(
            `${selector}[data-seq="${seq}"], ${selector}[data-result-seq="${seq}"]`,
          ) as HTMLElement | null;
        // A text reference targets the message itself. Its rail button may already
        // be mounted while the virtual message is absent; that is not a landing.
        const row = groups.value[idx];
        const messageTarget =
          sourceSeq() === seq ||
          (row?.type === 'entry' &&
            row.entry?.seq === seq &&
            ['assistant_message', 'user_message'].includes(row.entry?.kind));
        const node = messageTarget
          ? hold('.entry-anchor')
          : (hold('.proc-event-button') ??
            hold('.history-rail-node') ??
            hold('.history-chip-host') ??
            hold('.entry-anchor') ??
            (document.querySelector(`[data-seq="${seq}"], [data-result-seq="${seq}"]`) as HTMLElement | null));
        if (!node) {
          if (idx < 0) break;
          forcedOpen.value.add(groups.value[idx]!.key);
          virtualizer.value.scrollToIndex(idx, { align: 'center' });
          await nextTick();
          await nextFrame();
          continue;
        }
        // Commit source-range markers before landing. A separate delayed scroll in
        // the message races virtual row measurement and index reconciliation.
        await nextTick();
        await nextFrame();
        if (!current()) return;
        const range = node.querySelector<HTMLElement>('[data-reply-focus]');
        const viewport = virtualizer.value.scrollElement;
        if (viewport && node.classList.contains('entry-anchor')) {
          const box = (range ?? node).getBoundingClientRect();
          const offset = viewport.scrollTop + box.top - viewport.getBoundingClientRect().top;
          virtualizer.value.scrollToOffset(offset - Math.max(0, (viewport.clientHeight - box.height) / 2));
        } else node.scrollIntoView({ block: 'center' });
        // A step in a run's window, or a notice's button, shows itself as the one found.
        if (!node.classList.contains('entry-anchor')) {
          node.classList.remove('located');
          void node.offsetWidth;
          node.classList.add('located');
        }
        targetSeq.value = seq;
        if (targetTimer) clearTimeout(targetTimer);
        targetTimer = setTimeout(() => {
          targetSeq.value = null;
        }, 4000);
        chat.clearPendingSeq();
        forcedOpen.value = new Set();
        onLocated('history');
        return;
      }
      // Not found: nothing stays held open to pop up again as its row comes back.
      if (current()) {
        chat.clearPendingSeq();
        forcedOpen.value = new Set();
      }
    },
  );

  onScopeDispose(() => {
    if (targetTimer) clearTimeout(targetTimer);
  });

  return { targetSeq, forcedOpen };
}
