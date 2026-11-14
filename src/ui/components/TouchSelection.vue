<script setup lang="ts">
// Text selection on a touch screen, drawn by Wish rather than the platform: a platform's selection
// keeps its own colour on some systems and its own menu on all of them. A finger held on the words
// of a message selects the word under it; a handle at either end moves that end, and a bar beside
// the selection acts on it. A tap elsewhere lets it go. While this is on, the words cannot be
// selected by a touch screen's own means (`html.touch-selection` in base.css): iOS selects on a long
// press whatever the page says. That also rules out painting the selection as a highlight, which
// WebKit skips on text that cannot be selected, so it is boxes laid over the words. A mouse keeps
// the browser's own selection.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { observeLayout } from '../observeLayout.ts';
import { tr } from '../../core/i18n/tr.ts';
import { copyText } from '../clipboard.ts';
import { caretAt, glyphAt, selectionCovers, SELECTABLE_TEXT as ROOTS } from '../textAtPoint.ts';
import { noteSwallowedClick } from '../interactionSignals.ts';
import { selectionActions, type SelectionActions } from '../selectionActions.ts';
import { touchButton } from '../touchButton.ts';

// As long as a held finger takes to open a message's menu, so the two gestures read alike.
const HOLD_MS = 500;
const supported = !!(document.caretPositionFromPoint || document.caretRangeFromPoint);
const actionTouch = touchButton();

type Edge = { x: number; top: number; height: number };
type Box = { x: number; y: number; width: number; height: number };
const range = shallowRef<Range | null>(null);
const marks = ref<Box[]>([]);
const start = ref<Edge>();
const end = ref<Edge>();
const bar = ref<{ x: number; y: number; below: boolean }>();
const barOpen = ref(false);
const host = shallowRef<HTMLElement>();
const layer = ref<HTMLElement>();
const toolbar = ref<HTMLElement>();
const ownerActions = shallowRef<SelectionActions>();
const actions = computed(
  () => ownerActions.value?.items() ?? [{ key: 'copy', icon: 'copy', label: tr('复制', 'Copy') }],
);
let root: Element | null = null;
let relativeHost: HTMLElement | undefined;

function attach(textRoot: HTMLElement, node: Text) {
  stopFollowing?.();
  stopFollowing = undefined;
  relativeHost?.classList.remove('touch-selection-host');
  relativeHost = undefined;
  root = textRoot;
  // ReplyText supplies a host outside rendered Markdown, preserving its DOM/source
  // mapping and first/last-child paragraph layout. Other text can host its own marks.
  host.value = node.parentElement?.closest<HTMLElement>('[data-selection-host]') ?? textRoot;
  if (getComputedStyle(host.value).position === 'static') {
    relativeHost = host.value;
    relativeHost.classList.add('touch-selection-host');
  }
}

function show(next: Range | null) {
  range.value = next;
  ownerActions.value = next && root ? selectionActions(root, next) : undefined;
  place();
  if (next && root && !stopFollowing)
    stopFollowing = observeLayout(root, place, { scroll: false, ignore: () => layer.value });
}
function clear() {
  actionTouch.cancel();
  if (press?.timer) clearTimeout(press.timer);
  press = undefined;
  drag = undefined;
  root = null;
  barOpen.value = false;
  show(null);
  stopFollowing?.();
  stopFollowing = undefined;
  relativeHost?.classList.remove('touch-selection-host');
  relativeHost = undefined;
  host.value = undefined;
  cancelAnimationFrame(frame);
  frame = 0;
  measurePending = false;
}
// Layout changes above the selected row can move it without a scroll.
let stopFollowing: (() => void) | undefined;
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
// Marks and handles live in the message's own scroll layer. Their coordinates do
// not depend on the viewport, so scrolling moves them with the glyphs immediately.
function place() {
  const current = range.value;
  const anchor = host.value;
  if (!current || !root || !anchor) return;
  if (
    !root.isConnected ||
    !anchor.isConnected ||
    current.collapsed ||
    !anchor.contains(current.commonAncestorContainer)
  )
    return clear();
  const box = anchor.getBoundingClientRect();
  const left = box.left + anchor.clientLeft - anchor.scrollLeft;
  const top = box.top + anchor.clientTop - anchor.scrollTop;
  // Words of one line that run on across elements (a bold word, a link) make one mark, not a seam.
  const lines: Box[] = [];
  for (const box of textBoxes(current)) {
    if (!box.height) continue;
    const x = box.left - left;
    const y = box.top - top;
    const last = lines[lines.length - 1];
    if (
      last &&
      Math.abs(last.y - y) < 1 &&
      Math.abs(last.height - box.height) < 1 &&
      Math.abs(last.x + last.width - x) < 2
    ) {
      last.width = x + box.width - last.x;
    } else {
      lines.push({ x, y, width: box.width, height: box.height });
    }
  }
  marks.value = lines;
  const first = caretBox(current.startContainer, current.startOffset);
  const last = caretBox(current.endContainer, current.endOffset);
  start.value = { x: first.left - left, top: first.top - top, height: first.height };
  end.value = { x: last.right - left, top: last.top - top, height: last.height };
  placeToolbar();
}
function placeToolbar() {
  const current = range.value;
  if (!current || !root) return;
  const whole = current.getBoundingClientRect();
  const view = (root.closest('[data-selection-viewport]') ?? document.documentElement).getBoundingClientRect();
  const below = whole.top - 56 < view.top;
  const halfWidth = (toolbar.value?.offsetWidth ?? 200) / 2 + 8;
  bar.value =
    whole.bottom > view.top && whole.top < view.bottom
      ? {
          x: Math.min(Math.max((whole.left + whole.right) / 2, halfWidth), innerWidth - halfWidth),
          y: below ? whole.bottom + 28 : whole.top - 12,
          below,
        }
      : undefined;
}
watch([toolbar, actions], placeToolbar, { flush: 'post' });
let frame = 0;
let measurePending = false;
const placeSoon = (event: Event) => {
  // A nested code/table scroller can move glyphs within the message. Outer
  // transcript scrolling only needs to reposition the floating action bar.
  measurePending ||= !!root && event.target instanceof Node && root.contains(event.target);
  if (range.value && !frame)
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (measurePending) place();
      else placeToolbar();
      measurePending = false;
    });
};

// A word as the language divides it, around the character pressed.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
function wordAround(text: string, index: number): [number, number] {
  for (const { segment, index: from } of segmenter.segment(text)) {
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
  const x = event.clientX,
    y = event.clientY;
  press = { x, y, moved: false, held: false };
  const held = press;
  // Held on the selection, the bar comes back; held on other words, they become the selection.
  if (onSelection(x, y)) {
    held.timer = setTimeout(() => {
      held.held = true;
      barOpen.value = true;
    }, HOLD_MS);
    return;
  }
  const textRoot = event.target instanceof Element ? event.target.closest<HTMLElement>(ROOTS) : null;
  const glyph = textRoot && glyphAt(x, y, textRoot);
  if (!textRoot || !glyph) return;
  held.timer = setTimeout(() => {
    if (!textRoot.isConnected || !textRoot.contains(glyph.node) || glyph.index >= glyph.node.length) return;
    held.held = true;
    const [from, to] = wordAround(glyph.node.data, glyph.index);
    const word = document.createRange();
    word.setStart(glyph.node, from);
    word.setEnd(glyph.node, to);
    attach(textRoot, glyph.node);
    barOpen.value = true;
    // Lifting the finger must not also act on what it held, a link among the words say: no click
    // counts until it is lifted, and for the moment after.
    quietUntil = Infinity;
    show(word);
  }, HOLD_MS);
}
function onPointerMove(event: PointerEvent) {
  if (!press || event.pointerType !== 'touch' || Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 10)
    return;
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
  return !!range.value && selectionCovers(range.value, x, y);
}
// The platform's own selection and its long-press menu stay out of the words a touch selects.
function onSelectStart(event: Event) {
  const target = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
  if (performance.now() - lastTouch < 1500 && target?.closest(ROOTS)) event.preventDefault();
}
function onContextMenu(event: Event) {
  if (
    performance.now() - lastTouch < 1500 &&
    event.target instanceof Element &&
    event.target.closest(ROOTS) &&
    press &&
    !press.moved
  ) {
    if (glyphAt(press.x, press.y, event.target.closest(ROOTS)!)) event.preventDefault();
  }
}
function onClick(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('.ts-handle')) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
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
  const dy = event.clientY - ((event.currentTarget as Element).getBoundingClientRect().top + box.height / 2);
  drag =
    edge === 'start'
      ? { node: current.endContainer, offset: current.endOffset, dy }
      : { node: current.startContainer, offset: current.startOffset, dy };
  barOpen.value = false;
}
function onHandleMove(event: PointerEvent) {
  if (!drag || !root) return;
  if (!root.isConnected || !drag.node.isConnected || !root.contains(drag.node)) {
    drag = undefined;
    clear();
    return;
  }
  const caret = caretAt(event.clientX, event.clientY - drag.dy, root);
  if (!caret || !(caret.node instanceof Text) || !root.contains(caret.node)) return;
  const next = document.createRange();
  try {
    const length = drag.node instanceof Text ? drag.node.length : drag.node.childNodes.length;
    next.setStart(drag.node, Math.min(drag.offset, length));
    if (next.comparePoint(caret.node, caret.offset) >= 0) next.setEnd(caret.node, caret.offset);
    else next.setStart(caret.node, caret.offset);
  } catch {
    drag = undefined;
    clear();
    return;
  }
  if (!next.collapsed) show(next);
}
function onHandleUp() {
  if (!drag) return;
  drag = undefined;
  barOpen.value = true;
  place();
}

async function choose(key: string) {
  const current = range.value;
  if (!root?.isConnected || !current || current.collapsed) return clear();
  const owner = selectionActions(root, current);
  const text = range.value?.toString() ?? '';
  clear();
  if (owner) owner.select(key);
  else if (key === 'copy' && text) await copyText(text);
}

const listeners: [string, (event: never) => void][] = [
  ['pointerdown', onPointerDown],
  ['pointermove', onPointerMove],
  ['pointerup', onPointerUp],
  ['pointercancel', onPointerUp],
  ['selectstart', onSelectStart],
  ['contextmenu', onContextMenu],
  ['click', onClick],
];
onMounted(() => {
  if (!supported) return;
  document.documentElement.classList.add('touch-selection');
  for (const [type, listener] of listeners) document.addEventListener(type, listener as EventListener, true);
  addEventListener('scroll', placeSoon, { capture: true, passive: true });
});
onBeforeUnmount(() => {
  if (!supported) return;
  document.documentElement.classList.remove('touch-selection');
  for (const [type, listener] of listeners) document.removeEventListener(type, listener as EventListener, true);
  removeEventListener('scroll', placeSoon, { capture: true });
  clear();
});
</script>

<template>
  <Teleport v-if="range && host" :to="host">
    <div ref="layer" class="ts-layer">
      <div
        v-for="(mark, index) in marks"
        :key="index"
        class="ts-mark"
        :style="{ left: `${mark.x}px`, top: `${mark.y}px`, width: `${mark.width}px`, height: `${mark.height}px` }"
      />
      <div
        v-for="edge in ['start', 'end'] as const"
        :key="edge"
        class="touch-selection-ui ts-handle"
        :class="edge"
        :style="{
          left: `${(edge === 'start' ? start : end)?.x}px`,
          top: `${(edge === 'start' ? start : end)?.top}px`,
          height: `${(edge === 'start' ? start : end)?.height}px`,
        }"
        @pointerdown.stop="onHandleDown(edge, $event)"
        @pointermove="onHandleMove"
        @pointerup="onHandleUp"
        @pointercancel="onHandleUp"
      >
        <span class="ts-knob" />
      </div>
    </div>
  </Teleport>
  <Teleport to="body">
    <div
      v-if="range && bar && barOpen"
      ref="toolbar"
      class="touch-selection-ui ts-bar"
      :class="{ below: bar.below }"
      role="toolbar"
      :aria-label="tr('选中的文字', 'Selected text')"
      :style="{ left: `${bar.x}px`, top: `${bar.y}px` }"
      @mousedown.prevent
    >
      <button
        v-for="action in actions"
        :key="action.key"
        type="button"
        class="ts-action"
        :data-selection-action="action.key"
        :disabled="action.disabled"
        @click="actionTouch.acceptsClick($event) && choose(action.key)"
        @touchstart.passive="actionTouch.start"
        @touchmove.passive="actionTouch.move"
        @touchend="actionTouch.end"
        @touchcancel="actionTouch.cancel"
      >
        <Icon v-if="action.icon" :name="action.icon" /><span>{{ action.label }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
:global(.touch-selection-host) {
  position: relative;
}
.ts-layer {
  position: absolute;
  inset: 0;
  z-index: 65;
  pointer-events: none;
}
/* The selected words: the selection colour over them, blended so the text keeps its own. */
.ts-mark {
  position: absolute;
  z-index: 65;
  pointer-events: none;
  border-radius: 2px;
  background: var(--selection);
  mix-blend-mode: var(--selection-blend);
}
/* A handle: a thin accent bar the height of the line, with a knob above the start or below the end. */
.ts-handle {
  position: absolute;
  z-index: 66;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--accent);
  touch-action: none;
  pointer-events: auto;
}
.ts-handle::before {
  content: '';
  position: absolute;
  inset: -20px -18px;
}
.ts-knob {
  position: absolute;
  left: 50%;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
}
.ts-handle.start .ts-knob {
  top: -11px;
}
.ts-handle.end .ts-knob {
  bottom: -11px;
}
/* The bar: the same surface as a menu, laid out in a row like a phone's own. */
.ts-bar {
  position: fixed;
  z-index: 67;
  display: flex;
  width: max-content;
  max-width: calc(100vw - 16px);
  white-space: nowrap;
  gap: 2px;
  padding: 4px;
  transform: translate(-50%, -100%);
  background: var(--bg-overlay);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow-menu);
  animation: fade-in var(--dur-fast) var(--ease-out);
}
.ts-bar.below {
  transform: translate(-50%, 0);
}
.ts-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--fg);
  font: 500 14px/1 var(--font);
  -webkit-tap-highlight-color: transparent;
}
.ts-action:active {
  background: var(--bg-hover);
}
.ts-action .icon {
  width: 16px;
  height: 16px;
  color: var(--fg-muted);
}
</style>
