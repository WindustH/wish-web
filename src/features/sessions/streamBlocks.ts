// Streaming text → markdown blocks: render completed blocks once (each a
// cached Markdown instance whose text never changes) and re-render only the
// active tail. Blocks split on blank lines — paragraph, list and table
// boundaries — but a block never splits inside an open code fence: from an
// unclosed ``` onward everything is tail, because a half fence is not valid
// markdown yet. The split is pure so the boundary rules stay testable.
export type StreamBlocks = { stable: string[]; tail: string };

const FENCE = /^ {0,3}(```+|~~~+)/;

export function splitStreamBlocks(text: string): StreamBlocks {
  if (!text) return { stable: [], tail: '' };
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;   // the opening fence marker, while open
  for (const line of lines) {
    const marker = FENCE.exec(line);
    if (fence) {
      current.push(line);
      // A fence closes on a line of at least as many of the same characters
      // (the streaming approximation of markdown-it's rule); the block ends
      // with it, not at the next blank line.
      if (marker && marker[1]![0] === fence[0] && marker[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      if (current.length) blocks.push(current.join('\n'));   // text right before a fence
      current = [line];
      fence = marker[1]!;
      continue;
    }
    if (line.trim() === '') {
      if (current.length) { blocks.push(current.join('\n')); current = []; }
      continue;
    }
    current.push(line);
  }
  return { stable: blocks, tail: current.join('\n') };
}

// A tail that refuses to close (a very long unclosed fence, or math-heavy
// prose whose every re-render is expensive) is re-rendered on a slow timer
// instead of every frame.
export const TAIL_SLOW_CHARS = 4000;
export function tailThrottleMs(tail: string): number {
  return tail.length > TAIL_SLOW_CHARS ? 200 : 0;
}
