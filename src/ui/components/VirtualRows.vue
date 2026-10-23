<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { virtualWindow } from '../virtualWindow.ts';

const props = withDefaults(defineProps<{ count: number; rowSize?: number; overscan?: number; locateIndex?: number; itemKey?: (index: number) => string | number; label?: string }>(), { rowSize: 84, overscan: 3 });
const emit = defineEmits<{ resize: [width: number] }>();
const viewport = ref<HTMLElement>();
const height = ref(480), offset = ref(Math.max(0, props.locateIndex ?? 0) * props.rowSize);
const range = computed(() => virtualWindow(props.count, props.rowSize, height.value, offset.value, props.overscan));
const indices = computed(() => Array.from({ length: range.value.end - range.value.start }, (_, i) => range.value.start + i));
let observer: ResizeObserver | undefined;
function measure() {
  const el = viewport.value;
  if (!el?.clientWidth || !el.clientHeight) return;
  height.value = el.clientHeight;
  offset.value = el.scrollTop;
  emit('resize', el.clientWidth);
}
function scrollToIndex(index: number) {
  const el = viewport.value;
  if (!el) return;
  el.scrollTop = Math.max(0, index * props.rowSize - el.clientHeight / 2 + props.rowSize / 2);
  offset.value = el.scrollTop;
}
watch(() => props.locateIndex, async index => { if (index != null && index >= 0) { await nextTick(); scrollToIndex(index); } });
watch(() => props.rowSize, (size, previous) => {
  const el = viewport.value;
  if (el && previous > 0) { el.scrollTop *= size / previous; offset.value = el.scrollTop; }
});
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (viewport.value) observer.observe(viewport.value);
  if (props.locateIndex != null) scrollToIndex(props.locateIndex);
});
onBeforeUnmount(() => observer?.disconnect());
defineExpose({ scrollToIndex });
</script>

<template>
  <div ref="viewport" class="virtual-rows" tabindex="0" role="list" :aria-label="label"
    :style="{ height: `min(${range.total}px, 60dvh, 520px)` }" @scroll="offset = ($event.target as HTMLElement).scrollTop">
    <div class="virtual-rows-space" :style="{ height: `${range.total}px` }">
      <div v-for="index in indices" :key="itemKey?.(index) ?? index" class="virtual-rows-item" role="listitem" :aria-posinset="index + 1" :aria-setsize="count"
        :style="{ height: `${rowSize}px`, transform: `translateY(${index * rowSize}px)` }">
        <slot :index="index" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-rows { width:100%; min-width:0; overflow:auto; overscroll-behavior:contain; overflow-anchor:none; }
.virtual-rows-space { position:relative; width:100%; }
.virtual-rows-item { position:absolute; top:0; left:0; width:100%; box-sizing:border-box; overflow:hidden; }
.virtual-rows-item > :deep(.proc-event) { height:100%; box-sizing:border-box; overflow:hidden; }
.virtual-rows-item :deep(.proc-event-text strong) { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.virtual-rows-item :deep(.proc-event-text small) { -webkit-line-clamp:1; }
</style>
