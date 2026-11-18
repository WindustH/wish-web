<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui';
import { useDialogLayer } from '../composables/useDialogLayer.ts';
import { usePageActivity } from '../composables/usePageActivity.ts';
import { tr } from '../../core/i18n/tr.ts';
const props = defineProps<{ modelValue: string; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const open = ref(false),
  h = ref(0),
  s = ref(0),
  v = ref(0),
  draft = ref('');
const layer = useDialogLayer(),
  active = usePageActivity();
let emitted = '';
watch(active, (value) => {
  if (!value) open.value = false;
});
function read(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  h.value = !delta
    ? h.value
    : ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
  s.value = max ? delta / max : 0;
  v.value = max;
}
watch(
  () => props.modelValue,
  (value) => {
    draft.value = value.toUpperCase();
    if (value !== emitted) read(value);
  },
  { immediate: true },
);
const hue = computed(() => `hsl(${h.value} 100% 50%)`);
function commit() {
  const chroma = v.value * s.value,
    x = chroma * (1 - Math.abs(((h.value / 60) % 2) - 1)),
    m = v.value - chroma;
  const sectors = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  const color =
    '#' +
    sectors[Math.min(5, Math.floor(h.value / 60))]!.map((c) =>
      Math.round((c + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    ).join('');
  emitted = color;
  draft.value = color.toUpperCase();
  emit('update:modelValue', color);
}
function editHex() {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(draft.value)) {
    draft.value = props.modelValue.toUpperCase();
    return;
  }
  let color = draft.value.toLowerCase();
  if (color.length === 4) color = '#' + [...color.slice(1)].map((c) => c + c).join('');
  read(color);
  emitted = color;
  draft.value = color.toUpperCase();
  emit('update:modelValue', color);
}
function point(event: PointerEvent) {
  if (event.type !== 'pointerdown' && !(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
  if (event.type === 'pointerdown') (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  s.value = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  v.value = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  commit();
}
function arrow(event: KeyboardEvent) {
  const step = event.shiftKey ? 0.1 : 0.01;
  if (event.key === 'ArrowLeft') s.value -= step;
  else if (event.key === 'ArrowRight') s.value += step;
  else if (event.key === 'ArrowUp') v.value += step;
  else if (event.key === 'ArrowDown') v.value -= step;
  else return;
  event.preventDefault();
  s.value = Math.max(0, Math.min(1, s.value));
  v.value = Math.max(0, Math.min(1, v.value));
  commit();
}
</script>
<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger class="color-field" :aria-label="label + ': ' + modelValue">
      <span :style="{ background: modelValue }" /><code>{{ modelValue.toUpperCase() }}</code>
    </PopoverTrigger>
    <PopoverPortal v-if="active">
      <PopoverContent
        class="color-popover"
        :style="{ zIndex: layer }"
        :side-offset="6"
        :collision-padding="12"
        align="end"
        :aria-label="label"
        data-keyboard-boundary
        data-sheet-drag-ignore
      >
        <div class="color-title">{{ label }}</div>
        <div
          class="color-plane"
          :style="{ backgroundColor: hue }"
          tabindex="0"
          role="group"
          :aria-label="tr('饱和度和明度，使用方向键调整', 'Saturation and brightness; adjust with arrow keys')"
          @pointerdown.prevent="point"
          @pointermove="point"
          @keydown="arrow"
        >
          <span :style="{ left: s * 100 + '%', top: (1 - v) * 100 + '%', background: modelValue }" />
        </div>
        <input
          class="color-hue"
          type="range"
          min="0"
          max="359"
          :value="h"
          :aria-label="tr('色相', 'Hue')"
          @input="
            h = Number(($event.target as HTMLInputElement).value);
            commit();
          "
        />
        <label class="color-hex"
          ><span>HEX</span
          ><input
            v-model="draft"
            maxlength="7"
            spellcheck="false"
            autocomplete="off"
            :aria-label="tr('十六进制颜色', 'Hex color')"
            @change="editHex"
            @keydown.enter.prevent="editHex"
        /></label>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
<style scoped>
.color-field {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--fg-muted);
}
.color-field:hover,
.color-field:focus-visible,
.color-field[data-state='open'] {
  border-color: var(--accent);
  outline: none;
}
.color-field > span {
  width: 18px;
  height: 18px;
  border: 1px solid var(--line);
  border-radius: 4px;
}
.color-field code {
  font: 11px var(--mono);
}
:global(.color-popover) {
  width: 216px;
  padding: 10px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--bg-overlay);
  color: var(--fg);
  box-shadow: var(--shadow-pop);
}
.color-title {
  margin-bottom: 8px;
  font-size: 12px;
}
.color-plane {
  position: relative;
  height: 124px;
  border-radius: 5px;
  touch-action: none;
  background-image: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
}
.color-plane > span {
  position: absolute;
  width: 10px;
  height: 10px;
  transform: translate(-50%, -50%);
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #0008;
  pointer-events: none;
}
.color-hue {
  appearance: none;
  width: 100%;
  height: 10px;
  margin: 14px 0;
  border-radius: 5px;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}
.color-hue::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border: 2px solid var(--fg);
  border-radius: 50%;
  background: var(--bg-overlay);
}
.color-hue::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 2px solid var(--fg);
  border-radius: 50%;
  background: var(--bg-overlay);
}
.color-hex {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 10px var(--mono);
  color: var(--fg-subtle);
}
.color-hex input {
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--bg);
  color: var(--fg);
  font: 12px var(--mono);
}
.color-hex input:focus {
  outline: none;
  border-color: var(--accent);
}
@media (pointer: coarse) {
  .color-field {
    min-height: 36px;
  }
  .color-hex input {
    font-size: 16px;
  }
  .color-hue {
    height: 14px;
    margin: 16px 0;
  }
}
</style>
