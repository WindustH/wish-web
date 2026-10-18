<script lang="ts">
// Every open menu's closer, so a gesture that takes over from a press - a drag - can close the menu
// that press opened.
const closers = new Set<() => void>();
export function closeMenus() {
  for (const close of closers) close();
}
</script>

<script setup lang="ts">
// Every menu in the app. It opens from a button (the `trigger` slot, or an icon button around the
// default slot), or - with `context` - by a right click, a long press or the context-menu key on
// what the default slot renders. Either way it is the same menu: the same items, the same look,
// and the same ways to close. A clear backdrop (MenuBackdrop) takes any touch, click or wheel
// outside it, so that press closes the menu and does nothing else. A context menu is anchored at
// the point that was pressed within the element pressed, so it moves with that element when the
// page scrolls, and closes once that point is out of sight - its list scrolled or laid out anew
// under it, or the element gone as the list re-renders - rather than float off and leave the
// backdrop over a page that shows no menu; so does any menu of a page that is left. With `within`,
// only a press on
// the part it selects opens the menu; a press anywhere else in the element opens none, not even the
// browser's. With `selectsText`, a finger held on the text itself selects it (see TouchSelection),
// and only one held on the blank around it opens the menu. With `selectionItems`, a right click or a
// long press on text already selected opens those items instead, for what was selected.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot,
  DropdownMenuSeparator, DropdownMenuTrigger, Primitive,
} from 'reka-ui';
import Icon from './Icon.vue';
import MenuBackdrop from './MenuBackdrop.vue';
import { usePageActivity } from '../composables/usePageActivity.ts';
import { covers, glyphAt } from '../textAtPoint.ts';

// `checked` marks the current choice of a menu that picks one of several.
export type MenuItem = { key: string; label: string; icon?: string; danger?: boolean; shortcut?: string; separator?: boolean; checked?: boolean };

const props = withDefaults(defineProps<{
  items: MenuItem[];
  label?: string;
  heading?: string;
  context?: boolean;
  disabled?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  contentClass?: string;
  within?: string;
  selectsText?: boolean;
  selectionItems?: MenuItem[];
}>(), { side: 'bottom', align: 'end' });
// How long a finger rests on the element before its context menu opens.
const LONG_PRESS_MS = 500;
// `selection` is the selected text a menu of `selectionItems` was opened for.
const emit = defineEmits<{ select: [key: string, selection?: string] }>();
const pageActive = usePageActivity();
const open = ref(false);
function setOpen(value: boolean) {
  open.value = value;
}
const close = () => { cancelPress(); setOpen(false); };
closers.add(close);

// Where a context menu hangs: a point inside the element that was pressed. The object exists from
// the start and reads the point when asked: reka-ui forwards `reference` through its menu layers
// only if it is set on the first render, so it cannot arrive later.
const anchor = shallowRef<{ element: HTMLElement; x: number; y: number }>();
const reference = {
  get contextElement() { return anchor.value?.element; },
  getBoundingClientRect() {
    const at = anchor.value;
    if (!at) return new DOMRect();
    const box = at.element.getBoundingClientRect();
    return DOMRect.fromRect({ x: box.left + at.x, y: box.top + at.y, width: 0, height: 0 });
  },
};
// A long press opens the menu while the finger is still down; lifting it must not also act on
// what was pressed, so a click right after the menu opens goes nowhere.
let openedAt = 0;
// The selected text the open menu acts on, or null for the element's own items.
const selected = ref<string | null>(null);
const shown = computed(() => selected.value !== null && props.selectionItems ? props.selectionItems : props.items);
function openAt(element: HTMLElement, x: number, y: number, selection: string | null) {
  if (props.disabled && selection === null) return;
  const box = element.getBoundingClientRect();
  anchor.value = { element, x: x - box.left, y: y - box.top };
  selected.value = selection;
  openedAt = performance.now();
  setOpen(true);
}
// The element a press opens the menu on and the menu hangs from, or null for a press outside it.
function pressed(event: Event): HTMLElement | null {
  const element = event.currentTarget as HTMLElement;
  if (!props.within) return element;
  const part = (event.target as Element | null)?.closest?.<HTMLElement>(props.within);
  return part && element.contains(part) ? part : null;
}
function onContextMenu(event: MouseEvent) {
  const held = performance.now() - pressedAt < HELD_MS;
  // A finger held on text selects it rather than open the menu.
  if (held && touchPress && !blankPress) return;
  event.preventDefault();
  const element = event.currentTarget as HTMLElement;
  // From the keyboard there is no pointer; the menu opens near the corner of what is seen of it.
  if (!event.clientX && !event.clientY) {
    const part = props.within ? element.querySelector<HTMLElement>(props.within) ?? element : element;
    const seen = sightOf(part, clipsOf(part));
    if (seen) openAt(part, seen.left + Math.min(24, seen.width / 2), seen.top + Math.min(24, seen.height / 2), selectionAt(element));
    return;
  }
  // The selection as the press found it: a right click may select the word under it first.
  const selection = held ? pressSelection : selectionAt(element, event.clientX, event.clientY);
  const part = pressed(event);
  if (part) openAt(part, event.clientX, event.clientY, selection);
}
let press: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | undefined;
function cancelPress() {
  if (press) clearTimeout(press.timer);
  press = undefined;
}
// The last press, for the events the platform sends while it is held: the selection it landed on,
// and for a touch whether it held the blank rather than text. A touch on unselected text under
// `selectsText` is left to text selection.
const HELD_MS = 1500;
let pressedAt = -HELD_MS;
let touchPress = false;
let blankPress = true;
let pressSelection: string | null = null;
function onPointerDown(event: PointerEvent) {
  if (!event.isPrimary) return;
  const element = event.currentTarget as Element;
  const x = event.clientX, y = event.clientY;
  pressedAt = performance.now();
  pressSelection = selectionAt(element, x, y);
  touchPress = event.pointerType === 'touch';
  if (!touchPress || props.disabled && pressSelection === null) return;
  cancelPress();
  blankPress = pressSelection !== null || !props.selectsText || !glyphAt(x, y, element);
  const part = pressed(event);
  if (!part || !blankPress) return;
  const selection = pressSelection;
  press = { x, y, timer: setTimeout(() => { press = undefined; openAt(part, x, y, selection); }, LONG_PRESS_MS) };
}
// A hold that opens the menu keeps the selection as it is; the platform would otherwise select the
// word under the finger.
function onSelectStart(event: Event) {
  if (props.selectsText && touchPress && blankPress && performance.now() - pressedAt < HELD_MS) event.preventDefault();
}
// The text selected within `root` when there is some for `selectionItems` to act on, and the point,
// when given, lies on it.
function selectionAt(root: Element, x?: number, y?: number): string | null {
  const selection = document.getSelection();
  if (!props.selectionItems || !selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!range.intersectsNode(root)) return null;
  if (x !== undefined && y !== undefined && ![...range.getClientRects()].some(box => covers(box, x, y))) return null;
  return selection.toString() || null;
}
function onPointerMove(event: PointerEvent) {
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
}
function dropClickAfterPress(event: MouseEvent) {
  if (performance.now() - openedAt > 800) return;
  event.preventDefault();
  event.stopPropagation();
}
watch(pageActive, active => { if (!active) close(); });
// The ancestors that clip an element, and the part of it they and the window leave in sight.
function clipsOf(element: Element): Element[] {
  const clips: Element[] = [];
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY !== 'visible') clips.push(node);
  }
  return clips;
}
function sightOf(element: Element, clips: Element[]): DOMRect | null {
  let { left, top, right, bottom } = element.getBoundingClientRect();
  left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight);
  for (const node of clips) {
    const box = node.getBoundingClientRect();
    left = Math.max(left, box.left); top = Math.max(top, box.top); right = Math.min(right, box.right); bottom = Math.min(bottom, box.bottom);
  }
  return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null;
}
// Checked every frame while the menu is open: a list moves its rows without scrolling as often as
// it scrolls them.
let watching = 0;
watch(open, isOpen => {
  cancelAnimationFrame(watching);
  const at = anchor.value;
  if (!isOpen || !props.context || !at) return;
  const clips = clipsOf(at.element);
  const check = () => {
    const box = at.element.getBoundingClientRect();
    const seen = at.element.isConnected ? sightOf(at.element, clips) : null;
    if (seen && covers(seen, box.left + at.x, box.top + at.y)) watching = requestAnimationFrame(check);
    else close();
  };
  watching = requestAnimationFrame(check);
});
onBeforeUnmount(() => { cancelPress(); cancelAnimationFrame(watching); closers.delete(close); });
</script>

<template>
  <Primitive v-if="context" as-child data-context-menu :data-state="open && selected === null ? 'open' : 'closed'" @contextmenu="onContextMenu"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="cancelPress" @pointercancel="cancelPress"
    @selectstart="onSelectStart" @click.capture="dropClickAfterPress">
    <slot />
  </Primitive>
  <DropdownMenuRoot :open="open" :modal="false" @update:open="setOpen">
    <DropdownMenuTrigger v-if="!context" as-child :disabled="disabled">
      <slot name="trigger"><button type="button" class="btn ghost icon-only" :aria-label="label || 'menu'"><slot /></button></slot>
    </DropdownMenuTrigger>
    <DropdownMenuPortal v-if="pageActive">
      <DropdownMenuContent class="menu-pop" :class="contentClass" :reference="context ? reference : undefined"
        :side="context ? 'bottom' : side" :align="context ? 'start' : align" :side-offset="context ? 2 : 6" :collision-padding="8"
        @close-auto-focus="context && $event.preventDefault()">
        <DropdownMenuLabel v-if="heading" class="menu-heading">{{ heading }}</DropdownMenuLabel>
        <template v-for="item in shown" :key="item.key">
          <DropdownMenuSeparator v-if="item.separator" class="menu-separator" />
          <DropdownMenuItem class="menu-item" :class="{ 'menu-danger': item.danger }" @select="emit('select', item.key, selected ?? undefined)">
            <Icon v-if="item.icon" :name="item.icon" /><span class="menu-item-label">{{ item.label }}</span><kbd v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</kbd><Icon v-if="item.checked" name="check" class="menu-check" />
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
  <MenuBackdrop :open="open" @close="setOpen(false)" />
</template>
