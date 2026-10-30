// Keep one Markdown document during streaming: blank lines can belong to lists,
// quotes, math and reference definitions. Throttle long documents to bound rendering.
import { ref, watch, onUnmounted, type Ref } from 'vue';

export function useLiveMarkdown(streamText: Ref<string>) {
  const liveMarkdown = ref('');
  let pending = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelTimers = () => {
    if (frame) cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
    pending = false;
    frame = 0;
    timer = null;
  };

  const apply = () => {
    cancelTimers();
    liveMarkdown.value = streamText.value;
  };

  watch(streamText, (text) => {
    if (!text) {
      cancelTimers();
      liveMarkdown.value = '';
      return;
    }
    if (pending) return;
    // The very first content applies synchronously to avoid colliding frames
    if (!liveMarkdown.value) {
      apply();
      return;
    }
    pending = true;
    if (text.length > 4000) {
      timer = setTimeout(apply, 200);
    } else {
      frame = requestAnimationFrame(apply);
    }
  });

  onUnmounted(cancelTimers);

  return { liveMarkdown };
}
