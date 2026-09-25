import { ref, computed, watch, nextTick, type Ref } from 'vue';
import { cfg } from '../../core/config.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { useElasticOverscroll } from './useElasticOverscroll.ts';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

export interface UseChatScrollOptions {
  scrollEl: Ref<HTMLElement | null>;
  scrollContentEl: Ref<HTMLElement | null>;
  groups: Ref<any[]>;
  sessionId: Ref<string>;
  pageActive: Ref<boolean>;
  running: Ref<boolean | undefined>;
  streamState: Ref<any>;
  owns: (gen: number) => boolean;
  getEpoch: () => number;
}

export function useChatScroll(options: UseChatScrollOptions) {
  const {
    scrollEl,
    scrollContentEl,
    groups,
    sessionId,
    pageActive,
    running,
    streamState,
    owns,
    getEpoch,
  } = options;
  const elastic = useElasticOverscroll(scrollEl, scrollContentEl, pageActive, sessionId);

  let pageAway = false;
  const stick = ref(true);
  let direction: 'history' | 'latest' | undefined;
  const nearTop = ref(false);
  const nearBottom = ref(false);
  const farUp = ref(false);

  function measureScroll() {
    if (!pageActive.value || scrollbarHeld.value) return;
    const el = scrollEl.value;
    if (!el) return;
    const fromTop = el.scrollTop;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Restore follow only once the user actually reaches the bottom. A wide
    // threshold snapped over persistent error cards during ordinary scrolling.
    if (!stick.value && direction === 'latest' && !chat.hasMoreAfter.value && fromBottom <= 2) {
      stick.value = true;
    }
    nearTop.value = fromTop < cfg.history.prefetchOlderTriggerPx;
    nearBottom.value = fromBottom < cfg.history.fetchNewerTriggerPx;
    farUp.value = fromBottom > cfg.history.jumpLatestDistancePx;
  }

  // Leaving auto-follow alone is not enough to warrant a floating button.
  // When newer history pages remain unloaded, the real latest message is
  // beyond this rendered segment even if its local bottom is close.
  const showJump = computed(() => farUp.value || chat.hasMoreAfter.value);

  function scrollIntent(toward: 'history' | 'latest') {
    direction = toward;
    if (toward === 'history') stick.value = false;
  }

  function onWheel(event: WheelEvent) {
    if (event.deltaY) scrollIntent(event.deltaY < 0 ? 'history' : 'latest');
    elastic.wheel(event);
  }

  let touchY: number | undefined;
  function onTouchStart(event: TouchEvent) {
    touchY = event.touches[0]?.clientY;
    elastic.touchStart(event);
  }
  function onTouchMove(event: TouchEvent) {
    const next = event.touches[0]?.clientY;
    if (next != null && touchY != null && next !== touchY) {
      scrollIntent(next > touchY ? 'history' : 'latest');
    }
    touchY = next;
    elastic.touchMove(event);
  }

  function onTouchEnd() {
    touchY = undefined;
    elastic.release();
  }

  function onKeydown(event: KeyboardEvent) {
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) {
      scrollIntent('history');
    } else if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) {
      scrollIntent('latest');
    }
  }

  // ── Scrollbar Drag & Hold ───────────────────────────────────────────
  const scrollbarHeld = ref(false);
  let releaseMerge: (() => void) | undefined;
  let mergeReady: Promise<void> | undefined;
  let dragOffset = 0;

  function beforeHistoryMerge() {
    return mergeReady;
  }

  function onPointerDown(event: PointerEvent) {
    const el = scrollEl.value;
    if (!el || scrollbarHeld.value || event.button !== 0 || event.pointerType !== 'mouse' || event.target !== el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const gutter = el.offsetWidth - el.clientWidth;
    if (event.clientX < rect.right - Math.max(gutter, 12)) return;
    scrollbarHeld.value = true;
    stick.value = false;
    direction = undefined;
    dragOffset = el.scrollTop;
    mergeReady = new Promise<void>((resolve) => {
      releaseMerge = resolve;
    });
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

  watch(pageActive, (active) => {
    if (!active) {
      pageAway = true;
      releaseScrollbar();
    }
  });
  watch(sessionId, releaseScrollbar);

  // ── History Pagination ──────────────────────────────────────────────
  let loadingOlderBusy = false;
  let chained = 0;

  async function loadOlderAnchored() {
    if (loadingOlderBusy || scrollbarHeld.value || !pageActive.value) return;
    loadingOlderBusy = true;
    const gen = getEpoch();
    const anchor: { value: { top: number; height: number } | null } = { value: null };
    try {
      const added = await chat.loadOlder({ beforeMerge: async () => {
        await beforeHistoryMerge();
        const el = scrollEl.value;
        if (owns(gen) && pageActive.value && el) {
          anchor.value = { top: el.scrollTop, height: el.scrollHeight };
        }
      } });
      await nextTick();
      if (!owns(gen) || !pageActive.value) return;
      if (added && anchor.value && scrollEl.value) {
        const el = scrollEl.value;
        el.scrollTop = anchor.value.top + el.scrollHeight - anchor.value.height;
      }
      measureScroll();
      if (added && nearTop.value && chat.hasMoreBefore.value && chained < 12 && !scrollbarHeld.value) {
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
    if (chat.loadingNewer.value || scrollbarHeld.value || !pageActive.value) return;
    const gen = getEpoch();
    await chat.fetchNewer({ beforeMerge: beforeHistoryMerge });
    await nextTick();
    if (owns(gen)) measureScroll();
  }

  function onScroll() {
    if (!pageActive.value) return;
    const el = scrollEl.value;
    if (scrollbarHeld.value && el) {
      if (el.scrollTop !== dragOffset) {
        scrollIntent(el.scrollTop < dragOffset ? 'history' : 'latest');
      }
      dragOffset = el.scrollTop;
      return;
    }
    measureScroll();
    if (!nearTop.value) chained = 0;
    if (nearTop.value && chat.hasMoreBefore.value && !chat.loadingOlder.value) {
      loadOlderAnchored();
    }
    if (nearBottom.value && chat.hasMoreAfter.value && !chat.loadingNewer.value) {
      fetchNewerBelow();
    }
  }

  async function jumpLatest() {
    const gen = getEpoch();
    direction = 'latest';
    if (chat.hasMoreAfter.value && !(await chat.jumpToLatest())) return;
    await nextTick();
    if (!owns(gen) || !pageActive.value || direction !== 'latest') return;
    const el = scrollEl.value;
    if (el) el.scrollTop = el.scrollHeight;
    stick.value = true;
    measureScroll();
  }

  watch(chat.sentRun, (event) => {
    if (event?.sessionId === sessionId.value && pageActive.value) void jumpLatest();
  });

  // ── Initial tail landing & streaming follow ─────────────────────────
  let landed = false;
  watch([() => groups.value.length, running, pageActive], async () => {
    const gen = getEpoch();
    await nextTick();
    if (!owns(gen) || !pageActive.value) return;
    const backFromAway = pageAway;
    pageAway = false;
    if (!landed && groups.value.length) {
      landed = true;
      if (direction === 'history') return;
      const userMovedUp = () => direction === 'history';
      let previousHeight = -1;
      let stableFrames = 0;
      for (let i = 0; i < 24; i++) {
        if (!owns(gen) || !pageActive.value || userMovedUp()) return;
        const el = scrollEl.value;
        if (el && el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight;
          stableFrames = el.scrollHeight === previousHeight ? stableFrames + 1 : 0;
          previousHeight = el.scrollHeight;
          if (stableFrames >= 2) break;
        }
        await nextFrame();
      }
      const el = scrollEl.value;
      if (el && el.scrollTop === 0 && el.scrollHeight > el.clientHeight) landed = false;
      measureScroll();
      return;
    }
    if (!stick.value) return;
    const el2 = scrollEl.value;
    if (el2 && (!running.value || backFromAway)) el2.scrollTop = el2.scrollHeight;
  });

  watch(sessionId, () => {
    landed = false;
    direction = undefined;
    stick.value = true;
    farUp.value = false;
    chained = 0;
    loadingOlderBusy = false;
  });

  watch(streamState, (s) => {
    if (s?.active) {
      const owner = sessionId.value;
      nextTick(() => {
        const el = scrollEl.value;
        if (sessionId.value === owner && pageActive.value && el && stick.value) el.scrollTop = el.scrollHeight;
      });
    }
  });

  return {
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
  };
}
