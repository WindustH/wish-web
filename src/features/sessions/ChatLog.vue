<script setup lang="ts">
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
// TanStack owns prepend and measurement anchoring. User intent owns tail
// following; native scrollbar gestures suspend pagination until release.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { ArrowDown } from '@lucide/vue';
import { chat } from '../../core/state/chatSlice.js';
import { cfg } from '../../core/config.js';
import { i18n } from '../../core/i18n/index.js';
import { announce } from '../../ui/live.js';
import { groupEntries } from './grouping.js';
import HistoryItem from './HistoryItem.vue';
import ThinkingViewport from './ThinkingViewport.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity';
const pageActive = usePageActivity();

const props = defineProps<{ sessionId: string; mobile: boolean }>();

let epoch = 0;
const owns = (gen: number) => gen === epoch;
watch(() => props.sessionId, () => { epoch++; }, { flush: 'sync' });
onUnmounted(() => { epoch++; });

const scrollEl = ref<HTMLElement | null>(null);
const groups = computed(() => groupEntries(chat.entries.value));
const streamState = computed(() => chat.stream.value);
const running = computed(() => streamState.value?.active);
const runFailure = computed(() => !running.value && chat.snapshot.value?.last_error);
const streamText = computed(() => streamState.value?.text || '');
const streamReasoning = computed(() => streamState.value?.reasoning || '');
const workStatus = computed(() => {
  const state = streamState.value;
  if (state?.currentTool) return `${i18n.t('entry.toolCall')} · ${state.currentTool}`;
  return i18n.t(`chat.${state?.activity || 'working'}`);
});

const virtualizer = useVirtualizer(
  computed(() => {
    const items = groups.value;
    return {
      count: items.length,
      getScrollElement: () => scrollEl.value,
      estimateSize: () => 110,
      overscan: 6,
      getItemKey: (i: number) => items[i]!.key,
      anchorTo: 'end',
      followOnAppend: false,
    };
  }),
);

// ── reactive scroll state (updated on every scroll + once after layout) ──
const stick = ref(true);
let direction: 'history' | 'latest' | undefined;
const nearTop = ref(false);
const nearBottom = ref(false);
const farUp = ref(false);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

function measureScroll() {
  if (!pageActive.value || scrollbarHeld.value) return;
  const el = scrollEl.value;
  if (!el) return;
  const fromTop = el.scrollTop;
  const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (!stick.value && direction === 'latest' && !chat.hasMoreAfter.value
    && fromBottom < cfg.history.fetchNewerTriggerPx + 60) {
    stick.value = true;
    el.scrollTop = el.scrollHeight;
  }
  nearTop.value = fromTop < cfg.history.prefetchOlderTriggerPx;
  nearBottom.value = fromBottom < cfg.history.fetchNewerTriggerPx;
  farUp.value = fromBottom > cfg.history.jumpLatestDistancePx;
}
const showJump = computed(() => !stick.value || farUp.value || chat.hasMoreAfter.value);

// Following is user intent, not a distance threshold: a small upward gesture
// must win over the next stream frame even while still close to the bottom.
function scrollIntent(toward: 'history' | 'latest') {
  direction = toward;
  if (toward === 'history') stick.value = false;
}
function onWheel(event: WheelEvent) {
  if (event.deltaY) scrollIntent(event.deltaY < 0 ? 'history' : 'latest');
}
let touchY: number | undefined;
function onTouchStart(event: TouchEvent) { touchY = event.touches[0]?.clientY; }
function onTouchMove(event: TouchEvent) {
  const next = event.touches[0]?.clientY;
  if (next != null && touchY != null && next !== touchY) scrollIntent(next > touchY ? 'history' : 'latest');
  touchY = next;
}
function onKeydown(event: KeyboardEvent) {
  if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) scrollIntent('history');
  else if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) scrollIntent('latest');
}

// A response already in flight must also wait: otherwise releasing the
// scrollbar is too late to prevent a prepend from moving its thumb.
const scrollbarHeld = ref(false);
let releaseMerge: (() => void) | undefined;
let mergeReady: Promise<void> | undefined;
let dragOffset = 0;
function beforeHistoryMerge() { return mergeReady; }
function onPointerDown(event: PointerEvent) {
  const el = scrollEl.value;
  if (!el || scrollbarHeld.value || event.button !== 0 || event.pointerType !== 'mouse' || event.target !== el) return;
  const rect = el.getBoundingClientRect();
  const gutter = el.offsetWidth - el.clientWidth;
  // Overlay scrollbars occupy the same edge without reserving a gutter.
  if (event.clientX < rect.right - Math.max(gutter, 12)) return;
  scrollbarHeld.value = true;
  stick.value = false;
  direction = undefined;
  dragOffset = el.scrollTop;
  mergeReady = new Promise<void>((resolve) => { releaseMerge = resolve; });
}
function releaseScrollbar() {
  if (!scrollbarHeld.value) return;
  scrollbarHeld.value = false;
  releaseMerge?.();
  releaseMerge = undefined;
  mergeReady = undefined;
  nextTick(onScroll);
}
function onPointerMove(event: PointerEvent) {
  // Also handles release outside the browser before the pointer returns.
  if (scrollbarHeld.value && !(event.buttons & 1)) releaseScrollbar();
}
watch(scrollEl, (el, _, cleanup) => {
  if (!el) return;
  window.addEventListener('pointerup', releaseScrollbar, true);
  window.addEventListener('pointercancel', releaseScrollbar, true);
  window.addEventListener('blur', releaseScrollbar);
  window.addEventListener('pointermove', onPointerMove, true);
  cleanup(() => {
    window.removeEventListener('pointerup', releaseScrollbar, true);
    window.removeEventListener('pointercancel', releaseScrollbar, true);
    window.removeEventListener('blur', releaseScrollbar);
    window.removeEventListener('pointermove', onPointerMove, true);
    releaseScrollbar();
  });
});
watch(pageActive, (active) => { if (!active) releaseScrollbar(); });
watch(() => props.sessionId, releaseScrollbar);

let loadingOlderBusy = false;
let chained = 0;
async function loadOlderAnchored() {
  if (loadingOlderBusy || scrollbarHeld.value || !pageActive.value) return;
  loadingOlderBusy = true;
  const gen = epoch;
  try {
    const added = await chat.loadOlder({ beforeMerge: beforeHistoryMerge });
    await nextTick();
    if (!owns(gen) || !pageActive.value) return;
    measureScroll();
    if (added && nearTop.value && chat.hasMoreBefore.value && chained < 12 && !scrollbarHeld.value) {
      chained++;
      queueMicrotask(loadOlderAnchored);
    } else chained = 0;
  } finally {
    if (owns(gen)) loadingOlderBusy = false;
  }
}

async function fetchNewerBelow() {
  if (chat.loadingNewer.value || scrollbarHeld.value || !pageActive.value) return;
  const gen = epoch;
  await chat.fetchNewer({ beforeMerge: beforeHistoryMerge });
  await nextTick();
  if (owns(gen)) measureScroll();
}

function onScroll() {
  if (!pageActive.value) return;
  const el = scrollEl.value;
  if (scrollbarHeld.value && el) {
    if (el.scrollTop !== dragOffset) scrollIntent(el.scrollTop < dragOffset ? 'history' : 'latest');
    dragOffset = el.scrollTop;
    return;
  }
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
    direction = 'history';
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
  direction = 'latest';
  if (chat.hasMoreAfter.value && !await chat.jumpToLatest()) return;
  await nextTick();
  if (!owns(gen) || !pageActive.value || direction !== 'latest') return;
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
  stick.value = true;
  measureScroll();
}

// Only a successful local send that starts work resets the reader's intent.
watch(chat.sentRun, event => {
  if (event?.sessionId === props.sessionId && pageActive.value) void jumpLatest();
});

// Stream end → one polite announcement.
watch(running, (now, was) => { if (was && !now) announce(i18n.t('a11y.runDone')); });

// Initial tail + follow during streaming. The FIRST landing waits for
// measurement frames: setting scrollTop before the virtualizer has measured
// clamps to a half-built height and misreads as "near top" (scale B1).
let landed = false;
watch([() => groups.value.length, running, runFailure, pageActive], async () => {
  const gen = epoch;
  await nextTick();
  if (!owns(gen) || !pageActive.value) return;
  // First landing waits for layout, but must not override an upward gesture
  // made while the initial history request was still loading.
  if (!landed && groups.value.length) {
    landed = true;
    if (direction === 'history') return;
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
watch(() => props.sessionId, () => { landed = false; direction = undefined; stick.value = true; chained = 0; loadingOlderBusy = false; targetSeq.value = null; });
watch(streamState, (s) => {
  if (s?.active) nextTick(() => {
    const el = scrollEl.value;
    if (pageActive.value && el && stick.value) el.scrollTop = el.scrollHeight;
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
    <div v-if="chat.loadingOlder.value" class="history-loading" role="status" :aria-label="i18n.t('sessions.loading')"><span class="chat-skeleton older-skeleton" aria-hidden="true" /></div>
    <div ref="scrollEl" class="chatlog" :data-following="stick" tabindex="0" @scroll.passive="onScroll"
      @wheel.passive="onWheel" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove"
      @keydown="onKeydown" @pointerdown="onPointerDown" :data-scrollbar-held="scrollbarHeld">

      <div v-if="chat.loadingInitial.value && !groups.length" class="history-skeleton" role="status" :aria-label="i18n.t('sessions.loading')" aria-busy="true">
        <div class="chat-skeleton skeleton-user" aria-hidden="true" />
        <div class="skeleton-reply" aria-hidden="true"><span v-for="n in 3" :key="n" class="chat-skeleton" /></div>
      </div>
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
      <Transition name="live-work">
      <div v-if="running" :key="sessionId" class="live-row" aria-live="polite">
        <div v-if="streamText" class="live-text">{{ streamText }}</div>
        <ThinkingViewport v-else-if="streamReasoning" :key="sessionId" :text="streamReasoning" :tool="streamState?.currentTool" />
        <div class="work-status-slot"><Transition name="work-status">
          <div :key="workStatus" class="live-status" role="status"><Icon :class="{ 'work-spinner': !streamState?.currentTool }" :name="streamState?.currentTool ? 'wrench' : 'loader-circle'" /><span>{{ workStatus }}</span></div>
        </Transition></div>
      </div>
      </Transition>
      <div v-if="runFailure" class="chat-run-error" role="alert">
        <strong>{{ i18n.t('chat.runFailed') }}</strong>
        <p>{{ runFailure.message }}</p>
        <small>{{ runFailure.family }}</small>
      </div>
    </div>
    <Hint :text="i18n.t('chat.jumpLatest')" v-if="showJump"><button type="button" class="jump-latest"
       :aria-label="i18n.t('chat.jumpLatest')" @click="jumpLatest">
      <ArrowDown :size="20" aria-hidden="true" />
    </button></Hint>
  </div>
</template>

<style scoped>
.chat-run-error { margin: 16px auto; padding: 12px 16px; max-width: var(--max-content); border: 1px solid var(--err-border); border-radius: var(--radius); background: var(--err-bg); color: var(--err); overflow-wrap: anywhere; }
.chat-run-error strong { color: var(--err); font-size: 13px; }
.chat-run-error p { margin: 6px 0; font-size: 13px; }
.chat-run-error small { color: inherit; font: 12px/1.6 var(--mono); }
</style>
