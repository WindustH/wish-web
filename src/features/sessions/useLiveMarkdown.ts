// Keep one Markdown document during streaming: blank lines can belong to lists,
// quotes, math and reference definitions. Throttle long documents to bound rendering.
import { ref, watch, onUnmounted, type Ref } from 'vue';
import { streamingText } from '../../ui/streamingText.ts';

export function useLiveMarkdown(streamText: Ref<string>) {
  const liveMarkdown = ref('');
  const stream = streamingText((text) => {
    liveMarkdown.value = text;
  });
  watch(streamText, stream.write);
  onUnmounted(stream.cancel);

  return { liveMarkdown };
}
