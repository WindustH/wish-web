<script setup lang="ts">
import { inject, ref, shallowRef, watch, nextTick, onBeforeUnmount, computed } from 'vue';
import { replyContextKey } from '../references/context.ts';
import type { ReplyLink } from '../../core/replyReferences.ts';
import { validReference } from '../../core/replyReferences.ts';
import { markdownSourceRanges } from '../../ui/markdownSelection.ts';
import Markdown from '../../domain/references/ReferenceMarkdown.vue';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ seq?: number; block: number; text: string; plain?: boolean }>();
const context = inject(replyContextKey, undefined);
const root = ref<HTMLElement>();
const links = shallowRef<ReplyLink[]>([]);
const lines = shallowRef<{ x: number; y: number; width: number; height: number; link: ReplyLink }[]>([]);
const popup = ref<{ x: number; y: number; above: boolean; link: ReplyLink }>();
const focusLines = shallowRef<{ x: number; y: number; width: number; height: number }[]>([]);
const focused = computed(() => {
  const selected = context?.focus?.value;
  return selected &&
    selected.session === context?.session.value &&
    selected.seq === props.seq &&
    selected.block === props.block &&
    selected.start !== undefined &&
    selected.end !== undefined &&
    props.text.slice(selected.start, selected.end) === selected.text
    ? selected
    : undefined;
});
function measureFocus() {
  const el = root.value,
    selected = focused.value;
  if (!el || !selected) {
    focusLines.value = [];
    return;
  }
  let ranges: Range[] = [];
  const node = props.plain ? el.querySelector('[data-reply-plain]')?.firstChild : undefined;
  if (node?.nodeType === Node.TEXT_NODE) {
    const range = document.createRange();
    range.setStart(node, selected.start!);
    range.setEnd(node, selected.end!);
    ranges = [range];
  } else ranges = markdownSourceRanges(el, selected.start!, selected.end!);
  const box = el.getBoundingClientRect();
  focusLines.value = ranges.flatMap((range) =>
    [...range.getClientRects()]
      .filter((rect) => rect.width && rect.height)
      .map((rect) => ({ x: rect.left - box.left, y: rect.top - box.top, width: rect.width, height: rect.height })),
  );
}
// Highlight measurement never scrolls independently of the transcript's locate operation.
watch([root, focused], measureFocus, { flush: 'post' });
const preview = ref(''),
  error = ref(false),
  loading = ref(false);
let observer: ResizeObserver | undefined,
  frame = 0,
  hoverFrame = 0,
  hoverEvent: MouseEvent | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  controller: AbortController | undefined;
function measure() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const el = root.value;
    if (!el || !context) return;
    measureFocus();
    const box = el.getBoundingClientRect();
    const result: typeof lines.value = [];
    for (const link of links.value)
      for (const ref of link.references ?? []) {
        if (
          !validReference(ref) ||
          ref.seq !== props.seq ||
          ref.block !== props.block ||
          ref.start === undefined ||
          ref.end === undefined ||
          props.text.slice(ref.start, ref.end) !== ref.text
        )
          continue;
        let ranges: Range[] = [];
        if (props.plain) {
          const node = el.querySelector('[data-reply-plain]')?.firstChild;
          if (node?.nodeType === Node.TEXT_NODE && ref.end <= (node.textContent?.length ?? 0)) {
            const range = document.createRange();
            range.setStart(node, ref.start);
            range.setEnd(node, ref.end);
            ranges = [range];
          }
        } else ranges = markdownSourceRanges(el, ref.start, ref.end);
        for (const range of ranges)
          for (const rect of range.getClientRects())
            if (rect.width && rect.height)
              result.push({
                x: rect.left - box.left,
                y: rect.top - box.top,
                width: rect.width,
                height: rect.height,
                link,
              });
      }
    lines.value = result;
  });
}
watch(
  [
    () => props.seq,
    () => context?.session.value,
    () => context?.version?.(`message_${props.seq}`) ?? context?.revision.value,
  ],
  async (_, __, cleanup) => {
    const abort = new AbortController();
    cleanup(() => abort.abort());
    links.value = [];
    close();
    if (!context || props.seq === undefined) return;
    try {
      const result = await context.links(`message_${props.seq}`, abort.signal);
      if (!abort.signal.aborted) {
        links.value = result;
        await nextTick();
        measure();
      }
    } catch {
      /* A backlink failure must never prevent reading the message. */
    }
  },
  { immediate: true },
);
watch(
  [root, () => props.text],
  async () => {
    observer?.disconnect();
    await nextTick();
    if (root.value) {
      observer = new ResizeObserver(measure);
      observer.observe(root.value);
    }
    measure();
  },
  { flush: 'post' },
);
function hit(event: MouseEvent) {
  if (!lines.value.length) return;
  const box = root.value?.getBoundingClientRect();
  return (
    box &&
    lines.value.find(
      (line) =>
        event.clientX >= box.left + line.x &&
        event.clientX <= box.left + line.x + line.width &&
        event.clientY >= box.top + line.y &&
        event.clientY <= box.top + line.y + line.height,
    )
  );
}
function move(event: MouseEvent) {
  if (!lines.value.length) return;
  hoverEvent = event;
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    if (hoverEvent) updateHover(hoverEvent);
  });
}
function updateHover(event: MouseEvent) {
  if (event.buttons || document.getSelection()?.toString()) return;
  const line = hit(event);
  const cursor = line ? 'pointer' : '';
  if (root.value && root.value.style.cursor !== cursor) root.value.style.cursor = cursor;
  if (!line) {
    leave();
    return;
  }
  if (popup.value?.link.reply === line.link.reply) {
    clearTimeout(timer);
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(() => show(line.link, event.clientX, event.clientY), 300);
}
async function show(link: ReplyLink, x: number, y: number) {
  clearTimeout(timer);
  controller?.abort();
  controller = new AbortController();
  const own = controller;
  const above = y + 300 > innerHeight && y > innerHeight / 2;
  popup.value = {
    link,
    above,
    x: Math.max(8, Math.min(innerWidth - 368, x)),
    y: above ? y - 18 : y + 18,
  };
  preview.value = '';
  error.value = false;
  loading.value = true;
  try {
    const text = await context?.preview(link.reply, own.signal);
    if (!own.signal.aborted) preview.value = text ?? '';
  } catch {
    if (!own.signal.aborted) error.value = true;
  } finally {
    if (!own.signal.aborted) loading.value = false;
  }
}
function close() {
  cancelAnimationFrame(hoverFrame);
  hoverFrame = 0;
  hoverEvent = undefined;
  if (root.value) root.value.style.cursor = '';
  clearTimeout(timer);
  controller?.abort();
  popup.value = undefined;
}
function keepOpen() {
  clearTimeout(timer);
}
function leave() {
  cancelAnimationFrame(hoverFrame);
  hoverFrame = 0;
  hoverEvent = undefined;
  clearTimeout(timer);
  timer = setTimeout(close, 200);
}
function click(event: MouseEvent) {
  if (document.getSelection()?.toString()) return;
  const line = hit(event);
  if (line) {
    event.preventDefault();
    event.stopPropagation();
    context?.jump(line.link.reply);
    close();
  }
}
onBeforeUnmount(() => {
  close();
  observer?.disconnect();
  cancelAnimationFrame(frame);
  cancelAnimationFrame(hoverFrame);
});
</script>
<template>
  <div
    ref="root"
    class="reply-text"
    :class="{ 'reply-focused': !!focused }"
    :data-reply-seq="seq"
    :data-reply-block="block"
    @mousemove="move"
    @mouseleave="leave"
    @click.capture="click"
  >
    <slot />
    <span aria-hidden="true" class="reply-underlines"
      ><b
        v-for="(line, i) in focusLines"
        data-reply-focus
        :key="i"
        :style="{ left: `${line.x}px`, top: `${line.y}px`, width: `${line.width}px`, height: `${line.height}px` }"
    /></span>
    <span aria-hidden="true" class="reply-underlines"
      ><i
        v-for="(line, i) in lines"
        :key="i"
        :style="{ left: `${line.x}px`, top: `${line.y + line.height - 1}px`, width: `${line.width}px` }"
    /></span>
    <button
      v-if="lines.length"
      class="reply-access btn ghost sm"
      @click.stop="
        context?.jump(lines[0]!.link.reply);
        close();
      "
      @focus="show(lines[0]!.link, root!.getBoundingClientRect().left, root!.getBoundingClientRect().bottom)"
      @blur="leave"
      @keydown.esc="close"
    >
      {{ tr('查看回复', 'View reply') }}
    </button>
  </div>
  <Teleport to="body">
    <div
      v-if="popup"
      class="reply-preview"
      role="region"
      :aria-label="tr('回复预览', 'Reply preview')"
      :style="{ left: `${popup.x}px`, top: `${popup.y}px`, transform: popup.above ? 'translateY(-100%)' : undefined }"
      @mouseenter="keepOpen"
      @mouseleave="leave"
      @keydown.esc="close"
    >
      <div class="reply-preview-body">
        <span v-if="loading">{{ tr('正在读取…', 'Loading…') }}</span
        ><span v-else-if="error">{{ tr('无法读取回复', 'Could not load reply') }}</span
        ><Markdown v-else :text="preview.slice(0, 12000)" />
      </div>
    </div>
  </Teleport>
</template>
<style scoped>
.reply-text {
  position: relative;
  min-width: 0;
}
.reply-underlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.reply-underlines b {
  position: absolute;
  background: color-mix(in srgb, var(--accent) 24%, transparent);
  border-radius: 3px;
}
.reply-underlines i {
  position: absolute;
  border-bottom: 2px dotted var(--accent);
  opacity: 0.85;
}
.reply-access {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.reply-access:focus-visible {
  position: relative;
  width: auto;
  height: auto;
  clip-path: none;
}
:global(.reply-preview) {
  position: fixed;
  z-index: 80;
  width: min(360px, calc(100vw - 16px));
  max-height: 280px;
  display: flex;
  flex-direction: column;
  background: var(--bg-raised);
  color: var(--fg);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: 0 8px 32px #0004;
  overflow: hidden;
}
.reply-preview-body {
  overflow: auto;
  padding: 12px;
  font-size: 13px;
}
</style>
