import { ref, watch, onUnmounted, type Ref } from 'vue';
import { splitStreamBlocks, tailThrottleMs, type StreamBlocks } from './streamBlocks';

export function useLiveBlocks(streamText: Ref<string>) {
  const liveBlocks = ref<StreamBlocks>({ stable: [], tail: '' });
  let blocksPending = false;
  let blocksRaf = 0;
  let blocksTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelTimers = () => {
    if (blocksRaf) cancelAnimationFrame(blocksRaf);
    if (blocksTimer) clearTimeout(blocksTimer);
    blocksPending = false;
    blocksRaf = 0;
    blocksTimer = null;
  };

  const applyLiveBlocks = () => {
    cancelTimers();
    liveBlocks.value = splitStreamBlocks(streamText.value);
  };

  watch(streamText, (text) => {
    if (!text) {
      cancelTimers();
      liveBlocks.value = { stable: [], tail: '' };
      return;
    }
    if (blocksPending) return;
    // The very first content applies synchronously to avoid colliding frames
    if (!liveBlocks.value.stable.length && !liveBlocks.value.tail) {
      applyLiveBlocks();
      return;
    }
    blocksPending = true;
    if (tailThrottleMs(liveBlocks.value.tail)) {
      blocksTimer = setTimeout(applyLiveBlocks, 200);
    } else {
      blocksRaf = requestAnimationFrame(applyLiveBlocks);
    }
  });

  onUnmounted(cancelTimers);

  return { liveBlocks };
}
