<script setup lang="ts">
import { displayFailure } from '../../core/api/failures.ts';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { ArrowDown } from '@lucide/vue';
import { chat } from '../../core/state/chatSlice.ts';
import { chatWorkIndicator } from './phaseIndicator.ts';
import { i18n } from '../../core/i18n/index.ts';
import { announce } from '../../ui/live.ts';
import { groupEntries, type GroupItem } from './grouping.ts';
import type { EntryView } from '../../core/api/projections.ts';
import HistoryItem from './HistoryItem.vue';
import Markdown from '../../ui/components/Markdown.vue';
import ThinkingViewport from './ThinkingViewport.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useLiveBlocks } from './useLiveBlocks.ts';
import { useChatScroll } from './useChatScroll.ts';
import { useSearchLocate } from './useSearchLocate.ts';

const props = defineProps<{ sessionId: string; mobile: boolean }>();

const pageActive = usePageActivity();
let epoch = 0;
const owns = (gen: number) => gen === epoch;
const getEpoch = () => epoch;
watch(() => props.sessionId, () => { epoch++; }, { flush: 'sync' });
onUnmounted(() => { epoch++; });

const scrollEl = ref<HTMLElement | null>(null);
const scrollContentEl = ref<HTMLElement | null>(null);
const streamState = computed(() => chat.stream.value);
const running = computed(() => streamState.value?.active);
const runFailure = computed(() => {
  if (running.value) return null;
  const last = chat.entries.value.at(-1);
  if (last?.kind === 'run_error' || last?.kind === 'history_event') return null;
  return streamState.value?.error || chat.snapshot.value?.last_error;
});
const requestFailure = computed(() => displayFailure(chat.error.value));
// Keep status cards inside the measured list so its size matches the scroll
// container's actual content height.
// History rows, then a closing row for a failed request or run.
type ChatRow = GroupItem<EntryView> | { type: 'status_request_error' | 'status_run_error'; key: string };
const groups = computed(() => {
  const items: ChatRow[] = groupEntries(chat.entries.value);
  if (requestFailure.value) items.push({ type: 'status_request_error', key: `request-error:${props.sessionId}` });
  if (runFailure.value) items.push({ type: 'status_run_error', key: `run-error:${props.sessionId}` });
  return items;
});

const workIndicator = computed(() => chatWorkIndicator({
  running: running.value,
  phase: chat.snapshot.value?.phase,
  queue: chat.snapshot.value?.queue,
}));
const streamText = computed(() => streamState.value?.text || '');
const streamReasoning = computed(() => streamState.value?.reasoning || '');
const workStatus = computed(() => {
  const state = streamState.value;
  if (state?.currentTool) return `${i18n.t('entry.toolCall')} · ${state.currentTool}`;
  return i18n.t(`chat.${state?.activity || 'working'}`);
});
const standbyPreparing = computed(() => {
  return chat.stream.value?.standbyPreparing || chat.snapshot.value?.standby_preparing;
});

// Live stream markdown splitting & throttling
const { liveBlocks } = useLiveBlocks(streamText);

const virtualizer = useVirtualizer(
  computed(() => {
    const items = groups.value;
    return {
      count: items.length,
      getScrollElement: () => scrollEl.value,
      estimateSize: () => 110,
      overscan: 6,
      getItemKey: (i: number) => items[i]!.key,
      // Older pages are anchored after Vue commits the new sizer. The
      // virtualizer's end anchor writes before that commit and gets clamped
      // to the old scroll range, jumping to unrelated earlier messages.
      anchorTo: 'start',
      followOnAppend: false,
    };
  }),
);

const measureElement = (el: unknown) => {
  if (el) virtualizer.value.measureElement(el as HTMLElement);
};

// Reactive scroll & pagination management
const {
  stick,
  scrollbarHeld,
  showJump,
  measureScroll,
  scrollIntent,
  onWheel,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onKeydown,
  onPointerDown,
  onScroll,
  jumpLatest,
} = useChatScroll({
  scrollEl,
  scrollContentEl,
  groups,
  sessionId: computed(() => props.sessionId),
  pageActive,
  running,
  streamState,
  owns,
  getEpoch,
});

// Search locate & virtual item expansion
const { targetSeq, forcedOpen } = useSearchLocate(
  scrollEl,
  groups,
  virtualizer,
  owns,
  getEpoch,
  (toward) => {
    scrollIntent(toward);
    stick.value = false;
    measureScroll();
  },
);
// Whether a row holds the history entry a search result points at.
function holdsTarget(row: ChatRow | undefined) {
  const seq = targetSeq.value;
  if (seq == null || !row) return false;
  if (row.type === 'entry') return row.entry.seq === seq;
  if (row.type === 'process') return row.steps.some(step => (step.kind === 'entry' ? step.entry.seq : step.fromSeq) === seq);
  return false;
}

// Stream end → one polite announcement
watch(running, (now, was) => {
  if (was && !now) announce(i18n.t('a11y.runDone'));
});

// After every layout change (measure, groups, stream) re-derive scroll state
watch([() => groups.value.length, () => virtualizer.value.getVirtualItems().length], async () => {
  const gen = epoch;
  await nextTick();
  if (owns(gen)) measureScroll();
});

// Initial estimates can settle after the first tail landing. Follow late
// content growth only while the reader still wants the latest.
watch(scrollContentEl, (content, _, onCleanup) => {
  if (!content) return;
  let frame = 0;
  const observer = new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pageActive.value || !stick.value || scrollbarHeld.value) return;
      const el = scrollEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  });
  observer.observe(content);
  onCleanup(() => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  });
});
</script>

<template>
  <div class="chatlog-wrap">
    <div v-if="chat.loadingOlder.value" class="history-loading" role="status" :aria-label="i18n.t('sessions.loading')"><span class="chat-skeleton older-skeleton" aria-hidden="true" /></div>
    <div ref="scrollEl" class="chatlog" data-scroll-preserve :data-following="stick" tabindex="0" @scroll.passive="onScroll"
      @wheel.passive="onWheel" @touchstart.passive="onTouchStart" @touchmove="onTouchMove"
      @touchend.passive="onTouchEnd" @touchcancel.passive="onTouchEnd"
      @keydown="onKeydown" @pointerdown="onPointerDown" :data-scrollbar-held="scrollbarHeld">
      <div ref="scrollContentEl" class="chatlog-content">

      <div v-if="chat.loadingInitial.value && !groups.length" class="history-skeleton" role="status" :aria-label="i18n.t('sessions.loading')" aria-busy="true">
        <div class="chat-skeleton skeleton-user" aria-hidden="true" />
        <div class="skeleton-reply" aria-hidden="true"><span v-for="n in 3" :key="n" class="chat-skeleton" /></div>
      </div>
      <div v-else-if="!groups.length && !running" class="chat-empty hint">{{ i18n.t('chat.empty') }}</div>
      <div class="chatlog-inner" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }">
        <div v-for="v in virtualizer.getVirtualItems()" :key="groups[v.index]?.key" class="chat-virtual-row"
          :ref="measureElement"
          :data-index="v.index"
          :class="{ 'status-error-row': groups[v.index]?.type === 'status_request_error' || groups[v.index]?.type === 'status_run_error', 'history-target': holdsTarget(groups[v.index]) }"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }">
          <HistoryItem v-if="groups[v.index]?.type === 'entry' || groups[v.index]?.type === 'process'" :item="groups[v.index]!"
            :forced="groups[v.index]!.type === 'process' && forcedOpen.has(groups[v.index]!.key)"
            :session="sessionId" />
          <div v-else-if="groups[v.index]?.type === 'status_request_error' && requestFailure" class="chat-run-error" role="alert">
            <strong>{{ i18n.t('chat.requestFailed') }}</strong>
            <p>{{ requestFailure.message }}</p>
            <small v-if="requestFailure.family">{{ requestFailure.family }}</small>
            <button class="btn ghost sm" @click="chat.reload()">{{ i18n.t('chat.reload') }}</button>
            <button class="btn ghost sm" @click="chat.error.value = null">{{ i18n.t('common.close') }}</button>
          </div>
          <div v-else-if="groups[v.index]?.type === 'status_run_error' && runFailure" class="chat-run-error" role="alert">
            <strong>{{ i18n.t('chat.runFailed') }}</strong>
            <p>{{ runFailure.message }}</p>
            <small v-if="runFailure.family">{{ runFailure.family }}</small>
          </div>
        </div>
      </div>
      <Transition name="live-work">
      <div v-if="workIndicator === 'run'" :key="sessionId" class="live-row" aria-live="polite">
        <div v-if="streamText" class="live-text"><Markdown v-for="(b, i) in liveBlocks.stable" :key="i" :text="b" /><Markdown v-if="liveBlocks.tail" :key="'tail'" :text="liveBlocks.tail" /></div>
        <ThinkingViewport v-else-if="streamReasoning" :key="sessionId" :text="streamReasoning" :tool="streamState?.currentTool" />
        <div class="work-status-slot"><Transition name="work-status">
          <div :key="workStatus" class="live-status" role="status">
            <Icon class="work-spinner" name="loader-circle" />
            <span>{{ workStatus }}</span>
            <span v-if="standbyPreparing" class="standby-status-hint"> · {{ i18n.t('chat.standbyPreparing') }}</span>
          </div>
        </Transition></div>
      </div>
      </Transition>
      <Transition name="live-work">
      <div v-if="workIndicator === 'compacting'" :key="sessionId" class="live-row" role="status">
        <div class="work-status-slot"><div class="live-status"><Icon class="work-spinner" name="loader-circle" /><span>{{ i18n.t('chat.compacting') }}</span></div></div>
      </div>
      </Transition>
      <Transition name="live-work">
      <div v-if="workIndicator === 'stoppedResume'" :key="sessionId" class="live-row" role="status">
        <div class="work-status-slot"><div class="live-status stop-marker"><Icon name="square" />{{ i18n.t('chat.resumeHint', { n: chat.snapshot.value?.queue ?? 0 }) }}</div></div>
      </div>
      </Transition>
      <!-- Font-instance warmup: instantiates variable font styles once to prevent frame drops -->
      <div class="font-warmup" aria-hidden="true"><b>永</b><i>永</i><b><i>永</i></b><span class="warm-display">标题</span><code>code</code></div>
      </div>
    </div>
    <Hint :text="i18n.t('chat.jumpLatest')" v-if="showJump"><button type="button" class="jump-latest"
       :aria-label="i18n.t('chat.jumpLatest')" @click="jumpLatest">
      <ArrowDown :size="20" aria-hidden="true" />
    </button></Hint>
  </div>
</template>

<style scoped>
.font-warmup { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: hidden; opacity: 0.01; pointer-events: none; z-index: -1; font: 400 1px/1 var(--prose); }
.font-warmup .warm-display { font: 600 1px/1 var(--display); }
.font-warmup code { font: 400 1px/1 var(--mono); }

/* The live row keeps pre-wrap for the plain-text fallback; rendered
   markdown manages its own whitespace (pre inside code blocks). */
.live-text :deep(.markdown) { white-space: normal; }

.live-status.stop-marker { color: var(--err); }
.standby-status-hint { opacity: 0.85; }
.chat-virtual-row { display: flow-root; }
.status-error-row { padding: 16px 0; }
.chat-run-error { margin: 0 auto; padding: 12px 16px; max-width: var(--max-content); border: 1px solid var(--err-border); border-radius: var(--radius); background: var(--err-bg); color: var(--err); overflow-wrap: anywhere; }
.chat-run-error strong { color: var(--err); font-size: 13px; }
.chat-run-error p { margin: 6px 0; font-size: 13px; }
.chat-run-error small { color: inherit; font: calc(1em * var(--mono-scale))/1.6 var(--mono); }
</style>
