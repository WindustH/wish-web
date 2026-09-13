<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
const props = withDefaults(defineProps<{ open?: boolean }>(), { open: false });
const element = ref<HTMLDetailsElement>();
const expanded = ref(props.open);
let animation: Animation | undefined;
let target = props.open;
function toggle(event: MouseEvent) {
  const el = element.value!;
  if ((event.target as Element).closest('summary')?.parentElement !== el) return;
  event.preventDefault();
  target = animation ? !target : !el.open;
  const from = el.getBoundingClientRect().height;
  animation?.cancel();
  el.open = true;
  expanded.value = true;
  const style = getComputedStyle(el);
  const summary = el.querySelector('summary')!;
  const to = target ? el.getBoundingClientRect().height : summary.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { expanded.value = target; el.open = target; el.style.overflow = ''; return; }
  el.style.overflow = 'hidden';
  animation = el.animate([{ height: `${from}px`, opacity: .85 }, { height: `${to}px`, opacity: 1 }], { duration: 220, easing: 'ease-in-out' });
  animation.onfinish = () => { expanded.value = target; el.open = target; el.style.overflow = ''; animation = undefined; };
}
watch(() => props.open, value => { animation?.cancel(); target = value; expanded.value = value; if (element.value) element.value.style.overflow = ''; });
onBeforeUnmount(() => animation?.cancel());
</script>
<template><details ref="element" :open="expanded" @click="toggle"><slot /></details></template>
