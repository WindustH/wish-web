<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import type { GroupMessage } from '../../core/api/types.ts';
import { i18n } from '../../core/i18n/index.ts';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { measureChatElement, observeChatRect, refreshChatViewport } from '../sessions/virtualMeasurements.ts';
import GroupMessageItem from './GroupMessageItem.vue';

const props = defineProps<{ groupId: string; messages: GroupMessage[]; loading: boolean; hasOlder: boolean }>();
const emit = defineEmits<{ older: [] }>();
const scrollEl = ref<HTMLElement | null>(null);
const active = usePageActivity();
let following = true, disposed = false, requested = false;
let frame = 0, requestedLength = -1;
const virtualizer = useVirtualizer(computed(() => ({
  count: props.messages.length,
  enabled: active.value,
  getScrollElement: () => scrollEl.value,
  getItemKey: (index: number) => `${props.groupId}:${props.messages[index]!.seq}`,
  estimateSize: (index: number) => 80 + Math.min(800, Math.ceil(props.messages[index]!.text.length / 50) * 24) + (props.messages[index]!.attachments?.length ? 240 : 0),
  observeElementRect: observeChatRect,
  measureElement: measureChatElement,
  useAnimationFrameWithResizeObserver: true,
  overscan: 6,
  anchorTo: 'start' as const,
  followOnAppend: false,
})));
function measure(el: unknown) { if (el) virtualizer.value.measureElement(el as HTMLElement); }
function continues(index: number) {
  const author = props.messages[index]?.author, previous = props.messages[index - 1]?.author;
  return author?.kind === 'session' && previous?.kind === 'session' && author.id === previous.id;
}
function askOlder() {
  if (!active.value || requested || props.loading || !props.hasOlder) return;
  requested = true; requestedLength = props.messages.length;
  emit('older');
}
function settle() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const el = scrollEl.value;
    if (disposed || !active.value || !el) return;
    if (following) el.scrollTop = el.scrollHeight;
    if (el.scrollHeight <= el.clientHeight + 1) askOlder();
  });
}
function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) following = true;
  if (el.scrollTop < 200) askOlder();
}
// User intent wins over queued resize/append following, including before a scroll event fires.
let touchY = 0;
function stopFollowing() { following = false; }
function wheel(event: WheelEvent) { if (event.deltaY < 0) following = false; }
function touchStart(event: TouchEvent) { touchY = event.touches[0]?.clientY ?? 0; }
function touchMove(event: TouchEvent) { if ((event.touches[0]?.clientY ?? 0) > touchY) following = false; }
function keydown(event: KeyboardEvent) { if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) following = false; }
// Capture the visible sequence before Vue replaces the sizer, then restore its offset.
watch(() => props.messages, async (now, before) => {
  const el = scrollEl.value;
  const first = el && [...el.querySelectorAll<HTMLElement>('.group-virtual-row')]
    .find(row => row.getBoundingClientRect().bottom > el.getBoundingClientRect().top);
  const seq = first ? Number(first.dataset.seq) : undefined;
  const offset = first && el ? first.getBoundingClientRect().top - el.getBoundingClientRect().top : 0;
  const prepended = before.length > 0 && now[0]?.seq !== before[0]?.seq;
  await nextTick();
  if (disposed || !el || !active.value) return;
  if (prepended && !following && seq != null) {
    const index = now.findIndex(item => item.seq === seq);
    const target = virtualizer.value.getOffsetForIndex(index, 'start');
    if (target) {
      el.scrollTop = target[0] - offset + parseFloat(getComputedStyle(el).paddingTop);
      await nextTick();
      const row = el.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
      if (row && !disposed) el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - offset;
    }
  }
  settle();
}, { flush: 'pre' });
watch(() => props.loading, value => {
  if (!value) {
    const progressed = requestedLength !== props.messages.length;
    requested = false;
    if (progressed) settle();
  }
});
watch(() => virtualizer.value.getTotalSize(), settle, { flush: 'post' });
watch(active, async value => {
  if (!value) return;
  await nextTick();
  if (disposed) return;
  refreshChatViewport(virtualizer.value); settle();
});
onBeforeUnmount(() => { disposed = true; cancelAnimationFrame(frame); });
</script>

<template>
  <div class="chatlog-wrap">
    <div ref="scrollEl" class="chatlog" tabindex="0" @scroll.passive="onScroll" @wheel.passive="wheel"
      @touchstart.passive="touchStart" @touchmove.passive="touchMove" @keydown="keydown" @pointerdown="stopFollowing">
      <div class="chatlog-content">
        <div v-if="loading && !messages.length" class="history-skeleton" role="status" :aria-label="i18n.t('sessions.loading')" aria-busy="true">
          <div class="chat-skeleton skeleton-user" aria-hidden="true" />
        </div>
        <div v-else-if="!messages.length" class="chat-empty hint">{{ i18n.t('chat.empty') }}</div>
        <div class="chatlog-inner group-log" :style="{ position: 'relative', height: `${virtualizer.getTotalSize()}px`, width: '100%' }">
          <div v-for="item in virtualizer.getVirtualItems()" :key="String(item.key)" :ref="measure" :data-index="item.index" :data-seq="messages[item.index]!.seq"
            class="group-virtual-row" :style="{ transform: `translateY(${item.start}px)` }">
            <GroupMessageItem :message="messages[item.index]!" :group-id="groupId" :continues="continues(item.index)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.group-virtual-row { position: absolute; top: 0; left: 0; width: 100%; display: flow-root; }
</style>
