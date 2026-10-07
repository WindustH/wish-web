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
// page scrolls, and hides while the element is scrolled out of view. With `within`, only a press on
// the part it selects opens the menu; a press anywhere else in the element opens none, not even the
// browser's.
import { onBeforeUnmount, ref, shallowRef } from 'vue';
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot,
  DropdownMenuSeparator, DropdownMenuTrigger, Primitive,
} from 'reka-ui';
import Icon from './Icon.vue';
import MenuBackdrop from './MenuBackdrop.vue';
import { usePageActivity } from '../composables/usePageActivity.ts';

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
}>(), { side: 'bottom', align: 'end' });
// How long a finger rests on the element before its context menu opens.
const LONG_PRESS_MS = 500;
const emit = defineEmits<{ select: [key: string] }>();
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
function openAt(element: HTMLElement, x: number, y: number) {
  if (props.disabled) return;
  const box = element.getBoundingClientRect();
  anchor.value = { element, x: x - box.left, y: y - box.top };
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
  event.preventDefault();
  // From the keyboard there is no pointer; the menu opens near the corner of what it is for.
  if (!event.clientX && !event.clientY) {
    const element = event.currentTarget as HTMLElement;
    const part = props.within ? element.querySelector<HTMLElement>(props.within) ?? element : element;
    const box = part.getBoundingClientRect();
    openAt(part, box.left + 24, box.top + 24);
    return;
  }
  const part = pressed(event);
  if (part) openAt(part, event.clientX, event.clientY);
}
let press: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | undefined;
function cancelPress() {
  if (press) clearTimeout(press.timer);
  press = undefined;
}
function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch' || !event.isPrimary || props.disabled) return;
  cancelPress();
  const part = pressed(event);
  if (!part) return;
  const x = event.clientX, y = event.clientY;
  press = { x, y, timer: setTimeout(() => { press = undefined; openAt(part, x, y); }, LONG_PRESS_MS) };
}
function onPointerMove(event: PointerEvent) {
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
}
function dropClickAfterPress(event: MouseEvent) {
  if (performance.now() - openedAt > 800) return;
  event.preventDefault();
  event.stopPropagation();
}
onBeforeUnmount(() => { cancelPress(); closers.delete(close); });
</script>

<template>
  <Primitive v-if="context" as-child data-context-menu :data-state="open ? 'open' : 'closed'" @contextmenu="onContextMenu"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="cancelPress" @pointercancel="cancelPress"
    @click.capture="dropClickAfterPress">
    <slot />
  </Primitive>
  <DropdownMenuRoot :open="open" :modal="false" @update:open="setOpen">
    <DropdownMenuTrigger v-if="!context" as-child :disabled="disabled">
      <slot name="trigger"><button type="button" class="btn ghost icon-only" :aria-label="label || 'menu'"><slot /></button></slot>
    </DropdownMenuTrigger>
    <DropdownMenuPortal v-if="pageActive">
      <DropdownMenuContent class="menu-pop" :class="contentClass" :reference="context ? reference : undefined"
        :side="context ? 'bottom' : side" :align="context ? 'start' : align" :side-offset="context ? 2 : 6" :collision-padding="8"
        :hide-when-detached="context" @close-auto-focus="context && $event.preventDefault()">
        <DropdownMenuLabel v-if="heading" class="menu-heading">{{ heading }}</DropdownMenuLabel>
        <template v-for="item in items" :key="item.key">
          <DropdownMenuSeparator v-if="item.separator" class="menu-separator" />
          <DropdownMenuItem class="menu-item" :class="{ 'menu-danger': item.danger }" @select="emit('select', item.key)">
            <Icon v-if="item.icon" :name="item.icon" /><span class="menu-item-label">{{ item.label }}</span><kbd v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</kbd><Icon v-if="item.checked" name="check" class="menu-check" />
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
  <MenuBackdrop :open="open" @close="setOpen(false)" />
</template>
