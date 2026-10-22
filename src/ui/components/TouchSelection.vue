<script setup lang="ts">
// Text selection on a touch screen, drawn by Wish rather than the platform: a platform's selection
// keeps its own colour on some systems and its own menu on all of them. A finger held on the words
// of a message selects the word under it; a handle at either end moves that end, and a bar beside
// the selection acts on it. A tap elsewhere lets it go. While this is on, the words cannot be
// selected by a touch screen's own means (`html.touch-selection` in base.css): iOS selects on a long
// press whatever the page says. That also rules out painting the selection as a highlight, which
// WebKit skips on text that cannot be selected, so it is boxes laid over the words. A mouse keeps
// the browser's own selection.
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import { copyText } from '../clipboard.ts';
import { caretAt, covers, glyphAt, SELECTABLE_TEXT as ROOTS } from '../textAtPoint.ts';
import { noteSwallowedClick } from '../scrollStalls.ts';

// As long as a held finger takes to open a message's menu, so the two gestures read alike.
const HOLD_MS = 500;
const supported = !!(document.caretPositionFromPoint || document.caretRangeFromPoint);

type Edge = { x: number; top: number; height: number; shown: boolean };
type Box = { x: number; y: number; width: number; height: number };
const range = shallowRef<Range | null>(null);
const marks = ref<Box[]>([]);
const start = ref<Edge>();
const end = ref<Edge>();
const bar = ref<{ x: number; y: number; below: boolean }>();
const barOpen = ref(false);
let root: Element | null = null;

function show(next: Range | null) {
  range.value = next;
  place();
  if (next && !following) { followedAt = ''; following = requestAnimationFrame(follow); }
}
function clear() {
  root = null;
  barOpen.value = false;
  show(null);
  cancelAnimationFrame(following);
  following = 0;
}
// Rows above re-measure and replies grow without a scroll; while there is a selection, the marks
// follow its message wherever it moves.
let following = 0, followedAt = '';
function follow() {
  following = 0;
  if (!range.value || !root) return;
  const box = root.getBoundingClientRect();
  const at = `${box.left} ${box.top} ${box.width} ${box.height}`;
  if (at !== followedAt) { followedAt = at; place(); }
  if (range.value) following = requestAnimationFrame(follow);
}
// Another page has none of these words.
onBeforeUnmount(useRouter().afterEach(() => clear()));

// The caret box at one end of the selection: where its handle stands.
function caretBox(node: Node, offset: number): DOMRect {
  const caret = document.createRange();
  caret.setStart(node, offset);
  return caret.getClientRects()[0] ?? caret.getBoundingClientRect();
}
// The boxes of the selected words, line by line. A range's own boxes would also cover each element
// it holds whole, a paragraph or an item, as one block.
function textBoxes(current: Range): DOMRect[] {
  const common = current.commonAncestorContainer;
  const walker = document.createTreeWalker(common instanceof Text ? common.parentNode! : common, NodeFilter.SHOW_TEXT);
  const piece = document.createRange();
  const boxes: DOMRect[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!current.intersectsNode(node)) continue;
    piece.selectNodeContents(node);
    if (node === current.startContainer) piece.setStart(node, current.startOffset);
    if (node === current.endContainer) piece.setEnd(node, current.endOffset);
    for (const box of piece.getClientRects()) if (box.width > 0) boxes.push(box);
  }
  return boxes;
}
// The marks, the handles and the bar follow the selection as the page scrolls, and hide outside
// the log.
function place() {
  const current = range.value;
  if (!current || !root) return;
  if (!root.isConnected) return clear();
  const whole = current.getBoundingClientRect();
  const view = (root.closest('.chatlog') ?? document.documentElement).getBoundingClientRect();
  // Words of one line that run on across elements (a bold word, a link) make one mark, not a seam.
  const lines: Box[] = [];
  for (const box of textBoxes(current)) {
    const top = Math.max(box.top, view.top), bottom = Math.min(box.bottom, view.bottom);
    if (bottom <= top) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - top) < 1 && Math.abs(last.y + last.height - bottom) < 1 && Math.abs(last.x + last.width - box.left) < 2) {
      last.width = box.right - last.x;
    } else {
      lines.push({ x: box.left, y: top, width: box.width, height: bottom - top });
    }
  }
  marks.value = lines;
  const within = (box: DOMRect) => box.top >= view.top && box.bottom <= view.bottom;
  const first = caretBox(current.startContainer, current.startOffset);
  const last = caretBox(current.endContainer, current.endOffset);
  start.value = { x: first.left, top: first.top, height: first.height, shown: within(first) };
  end.value = { x: last.right, top: last.top, height: last.height, shown: within(last) };
  const below = whole.top - 56 < view.top;
  bar.value = whole.bottom > view.top && whole.top < view.bottom
    ? { x: Math.min(Math.max((whole.left + whole.right) / 2, 64), innerWidth - 64), y: below ? whole.bottom + 28 : whole.top - 12, below }
    : undefined;
}
let frame = 0;
const placeSoon = () => { if (range.value && !frame) frame = requestAnimationFrame(() => { frame = 0; place(); }); };

// A word as the language divides it, around the character pressed.
function wordAround(text: string, index: number): [number, number] {
  for (const { segment, index: from } of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)) {
    if (index < from + segment.length) return [from, from + segment.length];
  }
  return [index, index + 1];
}

// The press under way: where it began, whether it moved, and the hold that selects.
let press: { x: number; y: number; moved: boolean; held: boolean; timer?: ReturnType<typeof setTimeout> } | undefined;
let lastTouch = -Infinity;
let quietUntil = 0;
const isUi = (target: EventTarget | null) => target instanceof Element && !!target.closest('.touch-selection-ui');
function onPointerDown(event: PointerEvent) {
  if (!event.isPrimary) return;
  // Whatever the last press was, this one is new: only a hold of its own may keep its click.
  quietUntil = 0;
  if (event.pointerType !== 'touch') return;
  lastTouch = performance.now();
  if (press?.timer) clearTimeout(press.timer);
  press = undefined;
  if (isUi(event.target)) return;
  const x = event.clientX, y = event.clientY;
  press = { x, y, moved: false, held: false };
  const held = press;
  // Held on the selection, the bar comes back; held on other words, they become the selection.
  if (onSelection(x, y)) {
    held.timer = setTimeout(() => { held.held = true; barOpen.value = true; }, HOLD_MS);
    return;
  }
  const textRoot = event.target instanceof Element ? event.target.closest(ROOTS) : null;
  const glyph = textRoot && glyphAt(x, y, textRoot);
  if (!textRoot || !glyph) return;
  held.timer = setTimeout(() => {
    held.held = true;
    const [from, to] = wordAround(glyph.node.data, glyph.index);
    const word = document.createRange();
    word.setStart(glyph.node, from);
    word.setEnd(glyph.node, to);
    root = textRoot;
    barOpen.value = true;
    // Lifting the finger must not also act on what it held, a link among the words say: no click
    // counts until it is lifted, and for the moment after.
    quietUntil = Infinity;
    show(word);
  }, HOLD_MS);
}
function onPointerMove(event: PointerEvent) {
  if (!press || event.pointerType !== 'touch' || Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 10) return;
  press.moved = true;
  if (press.timer) clearTimeout(press.timer);
}
// A tap on the selection shows or hides its bar; a tap anywhere else lets it go.
function onPointerUp(event: PointerEvent) {
  if (!press || event.pointerType !== 'touch') return;
  const { x, y, moved, held, timer } = press;
  if (timer) clearTimeout(timer);
  press = undefined;
  if (held) quietUntil = performance.now() + 400;
  if (moved || held || !range.value) return;
  if (onSelection(x, y)) barOpen.value = !barOpen.value;
  else clear();
}
function onSelection(x: number, y: number) {
  return !!range.value && textBoxes(range.value).some(box => covers(box, x, y));
}
// The platform's own selection and its long-press menu stay out of the words a touch selects.
function onSelectStart(event: Event) {
  const target = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
  if (performance.now() - lastTouch < 1500 && target?.closest(ROOTS)) event.preventDefault();
}
function onContextMenu(event: Event) {
  if (performance.now() - lastTouch < 1500 && event.target instanceof Element && event.target.closest(ROOTS) && press && !press.moved) {
    if (glyphAt(press.x, press.y, event.target.closest(ROOTS)!)) event.preventDefault();
  }
}
function onClick(event: MouseEvent) {
  // Suppress only a synthetic click on the words that this hold selected.
  // A delayed click on an unrelated button (or a keyboard click) is not its
  // follow-up and must never be swallowed at document capture.
  if (performance.now() < quietUntil && root?.contains(event.target as Node) && !isUi(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    noteSwallowedClick('touch selection: lifting the finger that selected');
    quietUntil = 0;
  }
}

// Dragging a handle moves its end; the other end stays where it was, and the two may cross.
let drag: { node: Node; offset: number; dy: number } | undefined;
function onHandleDown(edge: 'start' | 'end', event: PointerEvent) {
  const current = range.value;
  const box = edge === 'start' ? start.value : end.value;
  if (!current || !box) return;
  event.preventDefault();
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  drag = edge === 'start'
    ? { node: current.endContainer, offset: current.endOffset, dy: event.clientY - (box.top + box.height / 2) }
    : { node: current.startContainer, offset: current.startOffset, dy: event.clientY - (box.top + box.height / 2) };
  barOpen.value = false;
}
function onHandleMove(event: PointerEvent) {
  if (!drag || !root) return;
  const caret = caretAt(event.clientX, event.clientY - drag.dy, root);
  if (!caret || !(caret.node instanceof Text) || !root.contains(caret.node)) return;
  const next = document.createRange();
  next.setStart(drag.node, drag.offset);
  if (next.comparePoint(caret.node, caret.offset) >= 0) next.setEnd(caret.node, caret.offset);
  else next.setStart(caret.node, caret.offset);
  if (!next.collapsed) show(next);
}
function onHandleUp() {
  if (!drag) return;
  drag = undefined;
  barOpen.value = true;
  place();
}

async function copy() {
  const text = range.value?.toString() ?? '';
  clear();
  if (text) await copyText(text);
}

const listeners: [string, (event: never) => void][] = [
  ['pointerdown', onPointerDown], ['pointermove', onPointerMove], ['pointerup', onPointerUp], ['pointercancel', onPointerUp],
  ['selectstart', onSelectStart], ['contextmenu', onContextMenu], ['click', onClick],
];
onMounted(() => {
  if (!supported) return;
  document.documentElement.classList.add('touch-selection');
  for (const [type, listener] of listeners) document.addEventListener(type, listener as EventListener, true);
  addEventListener('scroll', placeSoon, { capture: true, passive: true });
  addEventListener('resize', placeSoon);
});
onBeforeUnmount(() => {
  if (!supported) return;
  document.documentElement.classList.remove('touch-selection');
  for (const [type, listener] of listeners) document.removeEventListener(type, listener as EventListener, true);
  removeEventListener('scroll', placeSoon, { capture: true });
  removeEventListener('resize', placeSoon);
  clear();
});
</script>

<template>
  <Teleport to="body">
    <template v-if="range">
      <div v-for="(mark, index) in marks" :key="index" class="ts-mark"
        :style="{ left: `${mark.x}px`, top: `${mark.y}px`, width: `${mark.width}px`, height: `${mark.height}px` }" />
      <div v-for="edge in (['start', 'end'] as const)" v-show="(edge === 'start' ? start : end)?.shown" :key="edge"
        class="touch-selection-ui ts-handle" :class="edge"
        :style="{ left: `${(edge === 'start' ? start : end)?.x}px`, top: `${(edge === 'start' ? start : end)?.top}px`, height: `${(edge === 'start' ? start : end)?.height}px` }"
        @pointerdown="onHandleDown(edge, $event)" @pointermove="onHandleMove" @pointerup="onHandleUp" @pointercancel="onHandleUp">
        <span class="ts-knob" />
      </div>
      <div v-if="bar && barOpen" class="touch-selection-ui ts-bar" :class="{ below: bar.below }" role="toolbar"
        :aria-label="tr('选中的文字', 'Selected text')" :style="{ left: `${bar.x}px`, top: `${bar.y}px` }" @pointerdown.prevent>
        <button type="button" class="ts-action" @click="copy"><Icon name="copy" /><span>{{ tr('复制', 'Copy') }}</span></button>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
/* The selected words: the selection colour over them, blended so the text keeps its own. */
.ts-mark { position: fixed; z-index: 65; pointer-events: none; border-radius: 2px; background: var(--selection); mix-blend-mode: var(--selection-blend); }
/* A handle: a thin accent bar the height of the line, with a knob above the start or below the end. */
.ts-handle { position: fixed; z-index: 66; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--accent); touch-action: none; }
.ts-handle::before { content: ''; position: absolute; inset: -20px -18px; }
.ts-knob { position: absolute; left: 50%; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--accent); box-shadow: 0 1px 3px rgb(0 0 0 / 25%); }
.ts-handle.start .ts-knob { top: -11px; }
.ts-handle.end .ts-knob { bottom: -11px; }
/* The bar: the same surface as a menu, laid out in a row like a phone's own. */
.ts-bar { position: fixed; z-index: 67; display: flex; gap: 2px; padding: 4px; transform: translate(-50%, -100%); background: var(--bg-overlay); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow-menu); animation: fade-in var(--dur-fast) var(--ease-out); }
.ts-bar.below { transform: translate(-50%, 0); }
.ts-action { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; border: 0; border-radius: 8px; background: none; color: var(--fg); font: 500 14px/1 var(--font); -webkit-tap-highlight-color: transparent; }
.ts-action:active { background: var(--bg-hover); }
.ts-action .icon { width: 16px; height: 16px; color: var(--fg-muted); }
</style>
