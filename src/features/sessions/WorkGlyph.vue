<script setup lang="ts">
import Spinner from '../../ui/components/Spinner.vue';
import Icon from '../../ui/components/Icon.vue';
import type { WorkGlyphKind } from './workActivity.ts';

defineProps<{ kind: WorkGlyphKind }>();
const icons: Record<Exclude<WorkGlyphKind, 'working'>, string> = {
  recovery: 'refresh-cw',
  thinking: 'thinking',
  writing: 'pencil',
  prepare: 'tune',
  search: 'web-search',
  read: 'web-reader',
  image: 'image',
  editImage: 'image',
  video: 'video',
  audio: 'audio',
  transcribe: 'mic',
  shell: 'terminal',
  edit: 'file-diff',
  history: 'history-read',
  question: 'question',
  waiting: 'question',
  inspect: 'eye',
  task: 'tasks',
  file: 'file',
  session: 'chat',
  tool: 'tool',
  compact: 'storage',
  stopped: 'pause',
};
</script>
<template>
  <Spinner v-if="kind === 'working'" class="work-glyph glyph-working" :size="20" />
  <Icon v-else class="work-glyph" :class="'glyph-' + kind" :name="icons[kind]" :size="20" />
</template>
<style scoped>
.work-glyph {
  flex: none;
}
@media (prefers-reduced-motion: reduce) {
  .glyph-working.spin {
    animation: none;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .glyph-recovery {
    animation: glyph-turn 1.7s linear infinite;
  }
  .glyph-writing,
  .glyph-tool {
    animation: glyph-write 1.3s ease-in-out infinite;
  }
  .glyph-search :deep(circle),
  .glyph-search :deep(path:last-child),
  .glyph-inspect :deep(circle) {
    animation: glyph-look 0.95s ease-in-out infinite alternate;
  }
  .glyph-shell :deep(path),
  .glyph-waiting :deep(path:last-child),
  .glyph-question :deep(path:last-child),
  .glyph-session :deep(path:last-child),
  .glyph-task :deep(path),
  .glyph-thinking :deep(path:first-child),
  .glyph-video :deep(path:last-child),
  .glyph-transcribe :deep(rect) {
    animation: glyph-pulse 0.85s ease-in-out infinite alternate;
  }
  .glyph-audio :deep(path),
  .glyph-compact :deep(path),
  .glyph-prepare :deep(circle) {
    transform-origin: center;
    animation: glyph-wave 0.58s ease-in-out infinite alternate;
  }
  .glyph-image :deep(path),
  .glyph-editImage :deep(path),
  .glyph-read :deep(path:last-child),
  .glyph-history :deep(path:last-child),
  .glyph-edit :deep(path:last-child) {
    animation: glyph-trace 1.65s ease-in-out infinite;
  }
  .glyph-audio :deep(path:nth-child(even)) {
    animation-delay: -0.34s;
  }
  .glyph-audio :deep(path:nth-child(3)) {
    animation-delay: -0.58s;
  }
  .glyph-video :deep(path:last-child),
  .glyph-transcribe :deep(rect) {
    transform-origin: center;
    animation: glyph-beat 0.8s ease-in-out infinite alternate;
  }
  .glyph-thinking :deep(path:last-child) {
    animation: glyph-think 1.6s ease-in-out infinite;
  }
  .glyph-file {
    animation: glyph-look 0.95s ease-in-out infinite alternate;
  }
}
@keyframes glyph-beat {
  from {
    transform: scale(0.75);
    opacity: 0.45;
  }
  to {
    transform: scale(1.05);
    opacity: 1;
  }
}
@keyframes glyph-think {
  50% {
    stroke-opacity: 0.45;
  }
}
@keyframes glyph-turn {
  to {
    transform: rotate(360deg);
  }
}
@keyframes glyph-write {
  0%,
  100% {
    transform: translate(-1.4px, 1px) rotate(-6deg);
  }
  45% {
    transform: translate(1.8px, -1.4px) rotate(5deg);
  }
  70% {
    transform: translate(0.5px, 0.7px) rotate(-2deg);
  }
}
@keyframes glyph-look {
  from {
    transform: translateX(-1.8px);
  }
  to {
    transform: translateX(1.8px);
  }
}
@keyframes glyph-wave {
  from {
    transform: scaleY(0.38);
  }
  to {
    transform: scaleY(1);
  }
}
@keyframes glyph-pulse {
  from {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
}
@keyframes glyph-trace {
  0%,
  100% {
    stroke-dasharray: 28 32;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 28 32;
    stroke-dashoffset: 20;
  }
}
</style>
