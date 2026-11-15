<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { prefersReducedMotion } from '../motion/reducedMotion.ts';
const props = withDefaults(defineProps<{ open?: boolean }>(), { open: false });
const element = ref<HTMLDetailsElement>();
const expanded = ref(props.open);
let animation: Animation | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;
let target = props.open;
function cancelAnimation() {
  clearTimeout(deadline);
  const previous = animation;
  animation = undefined;
  if (previous) {
    previous.onfinish = previous.oncancel = null;
    previous.cancel();
  }
}
function settle() {
  cancelAnimation();
  expanded.value = target;
  if (element.value) {
    element.value.open = target;
    element.value.style.overflow = '';
  }
}
function toggle(event: MouseEvent) {
  const el = element.value!;
  if ((event.target as Element).closest('summary')?.parentElement !== el) return;
  event.preventDefault();
  target = animation ? !target : !el.open;
  const from = el.getBoundingClientRect().height;
  cancelAnimation();
  el.open = true;
  expanded.value = true;
  const style = getComputedStyle(el);
  const summary = el.querySelector('summary')!;
  const to = target
    ? el.getBoundingClientRect().height
    : summary.getBoundingClientRect().height +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth);
  if (prefersReducedMotion()) {
    settle();
    return;
  }
  el.style.overflow = 'hidden';
  animation = el.animate(
    [
      { height: `${from}px`, opacity: 0.85 },
      { height: `${to}px`, opacity: 1 },
    ],
    { duration: 220, easing: 'ease-in-out' },
  );
  animation.onfinish = animation.oncancel = settle;
  deadline = setTimeout(settle, 320);
}
watch(
  () => props.open,
  (value) => {
    target = value;
    settle();
  },
);
onDeactivated(settle);
onBeforeUnmount(cancelAnimation);
</script>
<template>
  <details ref="element" :open="expanded" @click="toggle"><slot /></details>
</template>
