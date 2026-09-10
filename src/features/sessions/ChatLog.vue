<script setup lang="ts">
// Virtualized conversation log (TanStack, dynamic measurement). Behaviors
// kept from the audited version:
//  · initial window at the tail; tail-follow while streaming;
//  · older history loads near the top with an EXACT reading anchor — the
//    anchor (first visible row + pixel offset + scroll metrics) is captured
//    in the slice's beforeMerge callback (response arrival), then restored
//    after merge/measure, with one settle pass for late image sizes;
//  · newer history loads near the bottom (hasMoreAfter) — the window is
//    bidirectional, jump-to-latest covers the rest;
//  · search locate: resident [data-seq] scrolls into view; a target pruned
//    by the virtualizer is re-mounted via its group index (process groups
//    included — forced open + step anchors); one 4s .history-target flag;
//  · live stream preview (text / reasoning / tool calls), not just a phase.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { ArrowDown } from '@lucide/vue';
import { chat } from '../../core/state/chatSlice.js';
import { cfg } from '../../core/config.js';
import { i18n } from '../../core/i18n/index.js';
import { announce } from '../../ui/live.js';
import { groupEntries } from './grouping.js';
import HistoryItem from './HistoryItem.vue';

const props = defineProps<{ sessionId: string; mobile: boolean }>();

let epoch = 0;
const owns = (gen: number) => gen === epoch;
watch(() => props.sessionId, () => { epoch++; }, { flush: 'sync' });
onUnmounted(() => { epoch++; });

const scrollEl = ref<HTMLElement | null>(null);
const groups = computed(() => groupEntries(chat.entries.value));
const streamState = computed(() => chat.stream.value);
const running = computed(() => streamState.value?.active);
const streamText = computed(() => streamState.value?.text || '');
const streamReasoning = computed(() => streamState.value?.reasoning || '');
const streamToolCount = computed(() => Object.keys(streamState.value?.toolCalls || {}).length);

const virtualizer = useVirtualizer(
  computed(() => ({
    count: groups.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => 110,
    overscan: 6,
    getItemKey: (i: number) => groups.value[i]?.key ?? `i${i}`,
  })),
);

// ── reactive scroll state (updated on every scroll + once after layout) ──
const stick = ref(true);
const nearTop = ref(false);
const nearBottom = ref(false);
const farUp = ref(false);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

function measureScroll() {
  const el = scrollEl.value;
  if (!el) return;
  const fromTop = el.scrollTop;
  const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  stick.value = fromBottom < cfg.history.fetchNewerTriggerPx + 60;
  nearTop.value = fromTop < cfg.history.prefetchOlderTriggerPx;
  nearBottom.value = fromBottom < cfg.history.fetchNewerTriggerPx;
  farUp.value = fromBottom > cfg.history.jumpLatestDistancePx;
}
const showJump = computed(() => (farUp.value || chat.hasMoreAfter.value) && !running.value);

// ── anchored older-history loading ─────────────────────────────────────
let loadingOlderBusy = false;
let chained = 0;   // consecutive top-pinned loadOlder pages (guard against runaway)
async function loadOlderAnchored() {
  if (loadingOlderBusy) return;
  loadingOlderBusy = true;
  const gen = epoch;
  const epochSid = chat.sessionId.value;   // late side effects must not cross sessions
  try {
    interface AnchorCap { scrollTop: number; height: number; seq: number | null; off: number }
    let cap: AnchorCap | undefined;
    await chat.loadOlder({
      // Fires at response-merge time: capture the ACTUAL reading position.
      beforeMerge: () => {
        const el = scrollEl.value;
        if (!el) return;
        const elTop = el.getBoundingClientRect().top;
        const rows = [...el.querySelectorAll('.entry-anchor, .proc-group')];
        const first = rows.find((n) => (n as HTMLElement).getBoundingClientRect().bottom > elTop + 4);
        cap = {
          scrollTop: el.scrollTop,
          height: el.scrollHeight,
          // A .proc-group carries data-seqs (plural, space list); its steps
          // carry singular data-seq but are UNMOUNTED while collapsed — so
          // the group's first member is the only reliable anchor id (root
          // review: capture must parse data-seqs, never yield null).
          seq: first ? Number((first as HTMLElement).dataset.seq
            ?? (first as HTMLElement).getAttribute('data-seqs')?.split(' ')[0]
            ?? (first as HTMLElement).querySelector('[data-seq]')?.getAttribute('data-seq')) || null : null,
          off: first ? Math.round((first as HTMLElement).getBoundingClientRect().top - elTop) : 0,
        };
      },
    });
    const c = cap;
    if (!c || !owns(gen) || chat.sessionId.value !== epochSid) return;
    await nextTick();
    await nextFrame();
    const el = scrollEl.value;
    if (!el || !owns(gen) || chat.sessionId.value !== epochSid) return;
    // Primary restore: absolute position via the height delta caused by the
    // prepend (independent of measurement timing).
    el.scrollTop = c.scrollTop + (el.scrollHeight - c.height);
    // Settle passes: dynamic measurement (TanStack measureElement runs after
    // mount, images load later) keeps shifting rows for a few frames — a
    // single re-pin lands before the new sizes are known and the anchor
    // drifts (scale B4: -167px). Converge on the captured offset instead,
    // bounded so a pathological layout can never loop forever.
    if (c.seq != null) {
      // TanStack measures rows AFTER mount (ResizeObserver) — sizes keep
      // arriving well past the first frames (scale B5.2: converge at frame
      // 2, drift again by +1500ms). Exit only after the anchor holds still
      // for 3 consecutive frames, within a hard frame budget.
      let stable = 0;
      for (let i = 0; i < 36 && stable < 3; i++) {
        await nextFrame();
        if (!owns(gen) || chat.sessionId.value !== epochSid) return;
        // A collapsed process group renders no step anchors — fall back to
        // the group root (data-seqs is a space-separated list).
        const node = (el.querySelector(`[data-seq="${c.seq}"]`)
          ?? el.querySelector(`[data-seqs~="${c.seq}"]`)) as HTMLElement | null;
        if (!node) continue;
        const delta = Math.round(node.getBoundingClientRect().top - el.getBoundingClientRect().top);
        if (Math.abs(delta - c.off) <= 2) { stable++; continue; }
        stable = 0;
        el.scrollTop += delta - c.off;
      }
    }
    measureScroll();
    // Pinned at the top: no further scroll events fire while scrollTop
    // stays 0, so the anchor restore must chain the next page itself
    // (bounded — a runaway loop must not fetch the whole history).
    if (nearTop.value && chat.hasMoreBefore.value && chained < 12) {
      chained++;
      queueMicrotask(loadOlderAnchored);
    } else {
      chained = 0;
    }
  } finally {
    if (owns(gen)) loadingOlderBusy = false;
  }
}

async function fetchNewerBelow() {
  if (chat.loadingNewer.value) return;
  const gen = epoch;
  await chat.fetchNewer();          // appended below: scrollTop stays valid
  await nextTick();
  if (owns(gen)) measureScroll();
}

function onScroll() {
  measureScroll();
  if (!nearTop.value) chained = 0;
  if (nearTop.value && chat.hasMoreBefore.value && !chat.loadingOlder.value) loadOlderAnchored();
  if (nearBottom.value && chat.hasMoreAfter.value && !chat.loadingNewer.value) fetchNewerBelow();
}

// ── search locate ───────────────────────────────────────────────────────
const targetSeq = ref<number | null>(null);
let targetTimer: ReturnType<typeof setTimeout> | null = null;
const groupIndexOf = (seq: number) => groups.value.findIndex((g: any) =>
  g.type === 'entry' ? g.entry?.seq === seq
  : (g.steps ?? []).some((st: any) => st.fromSeq === seq || st.entry?.seq === seq));

watch(() => chat.pendingSeq.value, async (seq) => {
  if (seq == null) return;
  const gen = epoch;
  const sessionAtStart = chat.sessionId.value;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!owns(gen) || chat.sessionId.value !== sessionAtStart) return;   // epoch: user switched
    const el = scrollEl.value;
    let node = el?.querySelector(`[data-seq="${seq}"]`) as HTMLElement | null;
    if (!node) {
      // Target pruned by the virtualizer: mount its group (center) and retry —
      // process groups get forced open so their step anchors exist.
      const idx = groupIndexOf(seq);
      if (idx < 0) break;
      forcedOpen.value.add(groups.value[idx]!.key);
      virtualizer.value.scrollToIndex(idx, { align: 'center' });
      await nextTick();
      await nextFrame();
      continue;
    }
    node.scrollIntoView({ block: 'center' });
    stick.value = false;
    targetSeq.value = seq;
    if (targetTimer) clearTimeout(targetTimer);
    targetTimer = setTimeout(() => { targetSeq.value = null; }, 4000);
    chat.clearPendingSeq();
    forcedOpen.value = new Set();
    measureScroll();
    return;
  }
  // Not resident and not locatable: leave the error to the search pane.
  if (owns(gen)) chat.clearPendingSeq();
});
const forcedOpen = ref(new Set<string>());
watch(() => chat.sessionId.value, () => { forcedOpen.value = new Set(); });

onUnmounted(() => { if (targetTimer) clearTimeout(targetTimer); });

async function jumpLatest() {
  const gen = epoch;
  await chat.jumpToLatest();
  await nextTick();
  if (!owns(gen)) return;
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
  stick.value = true;
  measureScroll();
}

// Stream end → one polite announcement.
watch(running, (now, was) => { if (was && !now) announce(i18n.t('a11y.runDone')); });

// Initial tail + follow during streaming. The FIRST landing waits for
// measurement frames: setting scrollTop before the virtualizer has measured
// clamps to a half-built height and misreads as "near top" (scale B1).
let landed = false;
watch([() => groups.value.length, running], async () => {
  const gen = epoch;
  await nextTick();
  if (!owns(gen)) return;
  // FIRST landing happens regardless of stick: at mount scrollTop=0, so
  // measureScroll reports stick=false and would cancel the initial jump
  // to the tail (scale B1/B3 cascade root #2).
  if (!landed && groups.value.length) {
    landed = true;
    for (let i = 0; i < 24; i++) {
      if (!owns(gen)) return;
      const el = scrollEl.value;
      if (el && el.scrollHeight > el.clientHeight) { el.scrollTop = el.scrollHeight; break; }
      await nextFrame();
    }
    const el = scrollEl.value;
    if (el && el.scrollTop === 0 && el.scrollHeight > el.clientHeight) landed = false;   // retry on the next trigger
    measureScroll();
    return;
  }
  if (!stick.value) return;
  const el2 = scrollEl.value;
  if (el2 && !running.value) el2.scrollTop = el2.scrollHeight;
});
watch(() => props.sessionId, () => { landed = false; stick.value = true; chained = 0; loadingOlderBusy = false; targetSeq.value = null; });
watch(streamState, (s) => {
  if (s?.active) nextTick(() => {
    const el = scrollEl.value;
    if (el && stick.value) el.scrollTop = el.scrollHeight;
  });
});

// After every layout change (measure, groups, stream) re-derive scroll state.
watch([() => groups.value.length, () => virtualizer.value.getVirtualItems().length], async () => {
  const gen = epoch;
  await nextTick();
  if (owns(gen)) measureScroll();
});
</script>

<template>
  <div class="chatlog-wrap">
    <div ref="scrollEl" class="chatlog" @scroll.passive="onScroll">
      <div v-if="chat.loadingOlder.value" class="log-loading">{{ i18n.t('sessions.loading') }}</div>
      <div v-if="chat.loadingInitial.value && !groups.length" class="log-loading">{{ i18n.t('sessions.loading') }}</div>
      <div v-else-if="!groups.length && !running" class="chat-empty hint">{{ i18n.t('chat.empty') }}</div>
      <div class="chatlog-inner" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }">
        <div v-for="v in virtualizer.getVirtualItems()" :key="groups[v.index]?.key"
          :ref="(el) => el && virtualizer.measureElement(el as HTMLElement)"
          :data-index="v.index"
          :class="{ 'history-target': targetSeq != null
            && (groups[v.index]?.type === 'entry'
              ? groups[v.index]!.entry.seq === targetSeq
              : groups[v.index]?.type === 'process'
                && (groups[v.index] as any).steps.some((s: any) => (s.kind === 'entry' ? s.entry.seq : s.fromSeq) === targetSeq)) }"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }">
          <HistoryItem v-if="groups[v.index]" :item="groups[v.index]!"
            :forced="groups[v.index]!.type === 'process' && forcedOpen.has(groups[v.index]!.key)" />
        </div>
      </div>
      <div v-if="running" class="live-row" aria-live="polite">
        <div v-if="streamText" class="live-text">{{ streamText }}</div>
        <div v-else-if="streamReasoning" class="live-reasoning hint">{{ streamReasoning }}</div>
        <div v-else class="hint">
          <span v-if="streamToolCount">{{ i18n.t('entry.toolCall') }} ×{{ streamToolCount }} · </span>{{ i18n.t('chat.thinking') }}
        </div>
      </div>
    </div>
    <button v-if="showJump" type="button" class="jump-latest"
      :title="i18n.t('chat.jumpLatest')" :aria-label="i18n.t('chat.jumpLatest')" @click="jumpLatest">
      <ArrowDown :size="20" aria-hidden="true" />
    </button>
  </div>
</template>
