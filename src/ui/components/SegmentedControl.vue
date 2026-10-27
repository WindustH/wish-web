<script setup lang="ts">
import { computed, useId } from 'vue';
import Icon from './Icon.vue';
import Hint from './Hint.vue';
const props = defineProps<{
  label: string;
  options: { value: string; label: string; icon: string; disabled?: boolean; tone?: 'danger' }[];
}>();
const model = defineModel<string>({ required: true });
const name = useId();
const selected = computed(() =>
  Math.max(
    0,
    props.options.findIndex((option) => option.value === model.value),
  ),
);
</script>

<template>
  <div
    class="segmented-control"
    role="radiogroup"
    :aria-label="label"
    :style="{ '--segments': options.length, '--selected': selected }"
  >
    <span class="segment-thumb" aria-hidden="true" />
    <Hint v-for="option in options" :key="option.value" :text="option.label">
      <label class="segment" :class="{ disabled: option.disabled, danger: option.tone === 'danger' }">
        <input
          v-model="model"
          type="radio"
          :name="name"
          :value="option.value"
          :disabled="option.disabled"
          :aria-label="option.label"
        />
        <Icon :name="option.icon" :size="18" />
      </label>
    </Hint>
  </div>
</template>

<style scoped>
.segmented-control {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--segments), minmax(0, 1fr));
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  isolation: isolate;
  min-width: 0;
}
.segment-thumb {
  position: absolute;
  z-index: -1;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px) / var(--segments));
  transform: translateX(calc(var(--selected) * 100%));
  border-radius: 7px;
  background: var(--accent-soft);
  transition: transform 160ms ease;
}
.segment {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 36px;
  padding: 0 9px;
  color: var(--fg-muted);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  border-radius: 7px;
}
.segment input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: inherit;
}
.segment:has(input:checked) {
  color: var(--accent);
}
.segment:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.segment.danger {
  color: var(--danger);
}
.segment.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .segment-thumb {
    transition: none;
  }
}
</style>
