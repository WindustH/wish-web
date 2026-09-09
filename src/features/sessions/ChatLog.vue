<script setup lang="ts">
// Virtualized conversation log (TanStack, dynamic measurement). Behaviors
// kept from the audited version: initial window at the tail; older history
// loads when scrolled near the top with a stable reading anchor (first
// visible entry keeps its offset); search locate scrolls [data-seq] into
// view once resident; jump-to-latest appears when the tail is far or the
// resident window is behind the live head.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { chat } from '../../core/state/chatSlice.js';
import { i18n } from '../../core/i18n/index.js';
import { announce } from '../../ui/live.js';
import { groupEntries } from './grouping.js';
import HistoryItem from './HistoryItem.vue';

const props = defineProps<{ sessionId: string; mobile: boolean }>();

const scrollEl = ref<HTMLElement | null>(null);
const groups = computed(() => groupEntries(chat.entries.value));
const streamState = computed(() => chat.stream.value);
const running = computed(() => streamState.value?.active);

const virtualizer = useVirtualizer(
  computed(() => ({
    count: groups.value.length,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => 110,
    overscan: 6,
    getItemKey: (i: number) => groups.value[i]?.key ?? `i${i}`,
  })),
);

const firstVisible = () => {
  const items = virtualizer.value.getVirtualItems();
  if (!items.length) return null;
  const g = groups.value[items[0]!.index];
  return { key: g?.key ?? null, offset: items[0]!.start - (scrollEl.value?.scrollTop ?? 0) };
};

// Tail-follow while a run streams (only when the user is at the bottom).
const stick = ref(true);
const onScroll = () => {
  const el = scrollEl.value;
  if (!el) return;
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  if (el.scrollTop < 600 && chat.hasMoreBefore.value && !chat.loadingOlder.value) {
    const anchor = firstVisible();
    chat.loadOlder().then(() => {
      if (!anchor?.key) return;
      nextTick(() => {
        const idx = groups.value.findIndex((g) => g.key === anchor.key);
        if (idx >= 0) virtualizer.value.scrollToIndex(idx, { align: 'start', behavior: 'auto' });
      });
    });
  }
};

const farUp = computed(() => {
  const el = scrollEl.value;
  if (!el) return false;
  return el.scrollHeight - el.scrollTop - el.clientHeight > 2000;
});
const showJump = computed(() => (farUp.value || chat.hasMoreAfter.value) && !running.value);

async function jumpLatest() {
  await chat.jumpToLatest();
  await nextTick();
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
  stick.value = true;
}

// Stream end → one polite announcement.
watch(running, (now, was) => {
  if (was && !now) announce(i18n.t('a11y.runDone'));
});

// Initial tail + follow during streaming.
watch([() => groups.value.length, running], async () => {
  if (!stick.value) return;
  await nextTick();
  const el = scrollEl.value;
  if (el && !running.value) el.scrollTop = el.scrollHeight;
});
watch(streamState, (s) => {
  if (s?.active) {
    nextTick(() => {
      const el = scrollEl.value;
      if (el && stick.value) el.scrollTop = el.scrollHeight;
    });
  }
});

// Search locate: scroll the target seq into view once it is resident.
watch(() => chat.pendingSeq.value, async (seq) => {
  if (seq == null) return;
  await nextTick();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const el = scrollEl.value?.querySelector(`[data-seq="${seq}"]`);
  if (el) {
    (el as HTMLElement).scrollIntoView({ block: 'center' });
    stick.value = false;
    chat.clearPendingSeq();
  }
});

onMounted(() => {
  const el = scrollEl.value;
  if (el) el.scrollTop = el.scrollHeight;
});
</script>

<template>
  <div class="chatlog-wrap">
    <div ref="scrollEl" class="chatlog" @scroll.passive="onScroll">
      <div v-if="chat.loadingOlder.value" class="log-loading">{{ i18n.t('sessions.loading') }}</div>
      <div v-if="chat.loadingInitial.value && !groups.length" class="log-loading">{{ i18n.t('sessions.loading') }}</div>
      <div v-else-if="!groups.length && !running" class="chat-empty hint">{{ i18n.t('chat.empty') }}</div>
      <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }">
        <div v-for="v in virtualizer.getVirtualItems()" :key="groups[v.index]?.key"
          :ref="(el) => el && virtualizer.measureElement(el as HTMLElement)"
          :data-index="v.index"
          :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }">
          <HistoryItem v-if="groups[v.index]" :item="groups[v.index]!" />
        </div>
      </div>
      <div v-if="running" class="live-row" aria-live="polite">
        <span v-if="streamState?.phase" class="hint">{{ i18n.t(`stream.${streamState.phase}`) || streamState.phase }}</span>
        <span v-else class="hint">{{ i18n.t('chat.thinking') }}</span>
      </div>
    </div>
    <button v-if="showJump" class="jump-latest" @click="jumpLatest">
      <span>{{ i18n.t('chat.jumpLatest') }}</span>
    </button>
  </div>
</template>
