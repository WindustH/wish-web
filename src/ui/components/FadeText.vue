<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
defineProps<{ text: string }>();
const outer = ref<HTMLElement | null>(null);
const inner = ref<HTMLElement | null>(null);
const overflow = ref(false);
let observer: ResizeObserver | undefined;
onMounted(() => {
  const measure = () => {
    overflow.value = !!outer.value && !!inner.value && inner.value.getBoundingClientRect().width > outer.value.clientWidth + .5;
  };
  observer = new ResizeObserver(measure);
  if (outer.value) observer.observe(outer.value);
  if (inner.value) observer.observe(inner.value);
  measure();
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <span ref="outer" class="fade-text" :class="{ 'fade-text-overflow': overflow }"><span ref="inner" class="fade-text-content">{{ text }}</span></span>
</template>
<style scoped>
.fade-text{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:clip}
.fade-text-content{display:inline-block;white-space:nowrap}
.fade-text-overflow{mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent);-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent)}
</style>
