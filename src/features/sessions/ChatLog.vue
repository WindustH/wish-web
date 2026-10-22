<script setup lang="ts">
import { displayFailure } from '../../core/api/failures.ts';
import Icon from '../../ui/components/Icon.vue';
import Hint from '../../ui/components/Hint.vue';
import { computed, nextTick, onUnmounted, provide, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { chat } from '../../core/state/chatSlice.ts';
import { chatWorkIndicator } from './phaseIndicator.ts';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
import { announce } from '../../ui/live.ts';
import { groupEntries, inlineChips, type ChipsItem, type GroupItem, type TextItem } from './grouping.ts';
import ActivityRail from './ActivityRail.vue';
import { railOpenKey, type RailOpen } from './railState.ts';
import type { RailEvent, RailRow } from './railLayout.ts';
import { chipEvents, noticeFailed, noticeIconName, noticeLabel, noticeText, noticeTone, resultLookup } from './entries/railMeta.ts';
import type { EntryView } from '../../core/api/projections.ts';
import HistoryItem from './HistoryItem.vue';
import Markdown from '../../ui/components/Markdown.vue';
import ThinkingViewport from './ThinkingViewport.vue';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { useLiveBlocks } from './useLiveBlocks.ts';
import { useChatScroll } from './useChatScroll.ts';
import { useSearchLocate } from './useSearchLocate.ts';
import { useRailSwipe } from './useRailSwipe.ts';
import { estimateRow } from './rowEstimate.ts';
import { useFreshRows } from './useFreshRows.ts';
import { awaitsAnswer } from '../../core/questionWatch.ts';
import { toolResultsKey } from './entries/processDetails.ts';
import { forgetSession } from './expandState.ts';

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
type ChatRow = GroupItem<EntryView> | TextItem<EntryView> | ChipsItem<EntryView> | { type: 'status_request_error' | 'status_run_error'; key: string };
const groups = computed(() => {
  const items: ChatRow[] = inlineChips(groupEntries(chat.entries.value));
  if (requestFailure.value) items.push({ type: 'status_request_error', key: `request-error:${props.sessionId}` });
  if (runFailure.value) items.push({ type: 'status_run_error', key: `run-error:${props.sessionId}` });
  return items;
});

// Open run windows outlast their rows while the log is shown, not a trip away from it.
watch(() => props.sessionId, (_, previous) => { if (previous) forgetSession(previous); });
onUnmounted(() => forgetSession(props.sessionId));

// A call's result may come in a later run than the call, past a question or a notice.
const toolResults = computed(() => new Map(chat.entries.value
  .filter(entry => entry.kind === 'tool_result' && entry.payload?.tool_call_id)
  .map(entry => [String(entry.payload!.tool_call_id), { kind: 'entry', entry, key: `r${entry.seq}` }])));
provide(toolResultsKey, toolResults);

// The rail's open requests, carried to whichever row hosts the chip asked for.
const railOpen = ref<RailOpen | null>(null);
provide(railOpenKey, railOpen);
let railTick = 0;
function openFromRail(request: { chipKey: string; stepKey: string | null }) {
  railOpen.value = { ...request, tick: ++railTick };
}

// The rail's rows: where each row starts and how tall it is - measured where the log has
// measured it, estimated where it has not - with the events that came in it.
const measureVersion = ref(0);
const railRows = computed<RailRow[]>(() => {
  void measureVersion.value;
  // The virtualizer's cache holds its VirtualItem records, not bare numbers: the height of a
  // measured row is its `size`. A measured row of height 0 - an unseen chips host - stays 0
  // (`??` catches only the unmeasured), so the running top never drifts or turns NaN.
  // Refresh the lazy cache before reading it: history can replace a chips host with reply
  // text (or prepend a page) before this render has asked the virtualizer for its new total.
  virtualizer.value.getTotalSize();
  const cache = virtualizer.value.measurementsCache;
  const width = scrollContentEl.value?.querySelector<HTMLElement>('.chatlog-inner')?.clientWidth || 736;
  let top = 0;
  return groups.value.map((row, index) => {
    const height = cache?.[index]?.size ?? estimateRow(row, width);
    const placed = { top: cache[index]?.start ?? top, height, events: rowEvents(row) };
    top = placed.top + height;
    return placed;
  });
});
const rowEvents = (row: ChatRow): RailEvent[] => {
  const chips: any[] = row.type === 'chips' ? row.chips : row.type === 'entry' && row.entry?.kind === 'assistant_message' ? (row as TextItem<EntryView>).before ?? [] : [];
  return chips.flatMap((chip: any): RailEvent[] => chip.type === 'process'
    ? chipEvents(chip, resultLookup(chip, toolResults.value)).map(event => ({ chipKey: chip.key, stepKey: event.key, icon: event.icon,
      failed: event.failed, warn: false, tip: event.title, seq: event.seq, step: event.step, preview: event.preview }))
    : [{ chipKey: chip.key, stepKey: null, icon: noticeIconName(chip.entry), failed: noticeFailed(chip.entry) || noticeTone(chip.entry) === 'error',
      warn: noticeTone(chip.entry) === 'warn', tip: noticeLabel(chip.entry), seq: chip.entry?.seq,
      step: { kind: 'entry', entry: chip.entry, key: chip.key }, preview: noticeText(chip.entry) }]);
};
// Where the rail stands. It lives inside the scrolling content, so its own y needs no thought -
// rows and nodes share one origin. On a phone, a drawer a rightward drag reveals (useRailSwipe):
// the panel translates aside and the rail rides with it, hidden wholly from hits until opened.
// On a writing desk it never hides: with margin to spare it floats in it beside the words; when
// the margin cannot hold a node (24), its badge (7) and air (9) there, the log itself yields a
// lane (.rail-lane, +40px of padding) and the rail stands in it. The lane is judged on the
// margin the words would have without it, so granting it cannot oscillate.
const wrapEl = ref<HTMLElement | null>(null);
const innerEl = ref<HTMLElement | null>(null);
const railVersion = ref(0);
const railTotal = computed(() => Math.max(36, virtualizer.value.getTotalSize()));
// The phone's lane gesture lives on the frame, never on the scroll container; its state outlives
// a session switch - it is the pane's preference, not the conversation's.
const railSwipe = useRailSwipe({ wrap: wrapEl, scroll: scrollEl, enabled: computed(() => props.mobile) });
const railPlace = computed(() => {
  if (props.mobile) return { visible: railSwipe.open.value, lane: false };
  void railVersion.value;
  const wrap = wrapEl.value;
  const inner = innerEl.value;
  const scroll = scrollEl.value;
  if (!wrap || !inner) return { visible: true, lane: false };
  const lane = scroll?.classList.contains('rail-lane') ?? false;
  const wordsLeft = inner.getBoundingClientRect().left - wrap.getBoundingClientRect().left - (lane ? 40 : 0);
  return { visible: true, lane: wordsLeft - 24 < 40 };
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
  // A question waits on the user, not on work: say so rather than "tool call · ask_user".
  // The open forms come with the snapshot, so this holds after a reload too.
  if (awaitsAnswer(chat.snapshot.value)) return tr('等待你回答上面的问题', 'Waiting for your answers above');
  if (state?.currentTool) return `${i18n.t('entry.toolCall')} · ${state.currentTool}`;
  return i18n.t(`chat.${state?.activity || 'working'}`);
});
const standbyPreparing = computed(() => {
  return chat.stream.value?.standbyPreparing || chat.snapshot.value?.standby_preparing;
});

// Live stream markdown splitting & throttling
const { liveBlocks } = useLiveBlocks(streamText);

// Rows that just arrived slide in. A reply's text is excluded: it was already
// on screen while it streamed, and must not appear a second time.
const fresh = useFreshRows(groups, computed(() => props.sessionId), () => !chat.loadingInitial.value,
  row => !(row.type === 'entry' && row.entry.kind === 'assistant_message'));

const virtualizer = useVirtualizer(
  computed(() => {
    const items = groups.value;
    const width = scrollContentEl.value?.querySelector<HTMLElement>('.chatlog-inner')?.clientWidth || 736;
    return {
      count: items.length,
      getScrollElement: () => scrollEl.value,
      estimateSize: (i: number) => estimateRow(items[i]!, width),
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
  ensureHistoryScrollable,
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
  groups,
  virtualizer,
  owns,
  getEpoch,
  (toward) => {
    scrollIntent(toward);
    measureScroll();
  },
);
// Whether a row is itself the history entry a search result points at; a step or notice found
// among a reply's buttons is marked on its own (useSearchLocate).
function holdsTarget(row: ChatRow | undefined): boolean {
  const seq = targetSeq.value;
  if (seq == null || !row) return false;
  if (row.type === 'entry') return row.entry.seq === seq;
  if (row.type === 'question') return row.entry.seq === seq || row.result?.seq === seq;
  return false;
}

// Stream end → one polite announcement
watch(running, (now, was) => {
  if (was && !now) announce(i18n.t('a11y.runDone'));
});

// After every layout change (measure, groups, stream) re-derive scroll state
watch([() => groups.value.length, () => virtualizer.value.getVirtualItems().length], async () => {
  const gen = epoch;
  measureVersion.value++;
  await nextTick();
  if (owns(gen)) measureScroll();
});

// Initial estimates can settle after the first tail landing. Follow late
// content growth only while the reader still wants the latest.
// The rail's lane is read from the layout around it - the frame, the words' column, the window -
// so every one of them is watched: a sidebar opening, the composer growing, the window resized.
// Each change is re-read a frame later, when the new layout has settled, so the lane follows a
// resize instead of vanishing on a stale measurement. The rail itself needs none of this to
// scroll: it lives in the content and rides the native scroll with no JS on the path.
watch([wrapEl, innerEl], (elements, _, onCleanup) => {
  const alive = elements.filter(Boolean) as HTMLElement[];
  if (!alive.length) return;
  let frame = 0;
  const measure = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      railVersion.value++;
      void ensureHistoryScrollable();
    });
  };
  const observer = new ResizeObserver(measure);
  for (const el of alive) observer.observe(el);
  window.addEventListener('resize', measure);
  onCleanup(() => {
    observer.disconnect();
    window.removeEventListener('resize', measure);
    if (frame) cancelAnimationFrame(frame);
  });
}, { immediate: true });
watch(scrollContentEl, (content, _, onCleanup) => {
  if (!content) return;
  let frame = 0;
  const observer = new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      // Estimates can shrink after measurement or the viewport can grow. A short log
      // still needs older pages, even when no native scroll event can fire.
      void ensureHistoryScrollable();
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
  <div ref="wrapEl" class="chatlog-wrap"
    @wheel.passive="onWheel" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove"
    @touchend.passive="onTouchEnd" @touchcancel.passive="onTouchEnd">
    <div v-if="chat.loadingOlder.value" class="history-loading" role="status" :aria-label="i18n.t('sessions.loading')"><span class="chat-skeleton older-skeleton" aria-hidden="true" /></div>
    <div ref="scrollEl" class="chatlog" :class="{ 'rail-lane': railPlace.lane }" data-scroll-preserve :data-following="stick" tabindex="0"
      @keydown="onKeydown" @pointerdown="onPointerDown" :data-scrollbar-held="scrollbarHeld" @scroll.passive="onScroll">
      <div ref="scrollContentEl" class="chatlog-content">

      <div v-if="chat.loadingInitial.value && !groups.length" class="history-skeleton" role="status" :aria-label="i18n.t('sessions.loading')" aria-busy="true">
        <div class="chat-skeleton skeleton-user" aria-hidden="true" />
        <div class="skeleton-reply" aria-hidden="true"><span v-for="n in 3" :key="n" class="chat-skeleton" /></div>
      </div>
      <div v-else-if="!groups.length && !running" class="chat-empty hint">{{ i18n.t('chat.empty') }}</div>
      <div ref="innerEl" class="chatlog-inner" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }">
        <div v-for="v in virtualizer.getVirtualItems()" :key="groups[v.index]?.key" class="chat-virtual-row"
          :ref="measureElement"
          :data-index="v.index"
          :class="{ 'status-error-row': groups[v.index]?.type === 'status_request_error' || groups[v.index]?.type === 'status_run_error', 'history-target': holdsTarget(groups[v.index]), 'row-enter': fresh.has(groups[v.index]?.key ?? '') }"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }">
          <HistoryItem v-if="['entry', 'process', 'chips', 'question'].includes(groups[v.index]?.type ?? '')" :item="groups[v.index]!"
            :forced-keys="forcedOpen" :session="sessionId" />
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
      <!-- The rail lives in the scrolling content itself: it rides the log's native scroll with no
           JS on the path, so it can never run a frame behind the messages it annotations. -->
      <ActivityRail :rows="railRows" :total="railTotal" :visible="railPlace.visible" :session="sessionId" @open="openFromRail" />
      </div>
    </div>
    <Hint :text="i18n.t('chat.jumpLatest')" v-if="showJump"><button type="button" class="jump-latest"
       :aria-label="i18n.t('chat.jumpLatest')" @click="jumpLatest">
      <Icon name="arrow-down" :size="20" aria-hidden="true" />
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
/* A new row rises into place; `translate` leaves the row's positioning transform alone. */
.chat-virtual-row.row-enter > :deep(*) { animation: row-enter 420ms cubic-bezier(.2, .8, .2, 1) both; }
@keyframes row-enter { from { opacity: 0; translate: 0 14px; } }
.status-error-row { padding: 16px 0; }
.chat-run-error { margin: 0 auto; padding: 12px 16px; max-width: var(--max-content); border: 1px solid var(--err-border); border-radius: var(--radius); background: var(--err-bg); color: var(--err); overflow-wrap: anywhere; }
.chat-run-error strong { color: var(--err); font-size: 13px; }
.chat-run-error p { margin: 6px 0; font-size: 13px; }
.chat-run-error small { color: inherit; font: calc(1em * var(--mono-scale))/1.6 var(--mono); }
</style>
