<script setup lang="ts">
import { watch } from 'vue';
import { ReorderGroup, ReorderItem, useDragControls } from 'motion-v';
import { useIsMobile } from '../../ui/composables/useMedia.ts';

const order = defineModel<string[]>({ required: true });
const emit = defineEmits<{ open: [id: string] }>();
const mobile = useIsMobile();
const controls = new Map<string, ReturnType<typeof useDragControls>>();
const controlsOf = (id: string) => controls.get(id) ?? controls.set(id, useDragControls()).get(id)!;
let suppressOpenUntil = 0;
function open(id: string) {
  if (Date.now() > suppressOpenUntil) emit('open', id);
}
function move(id: string, delta: number) {
  const values = [...order.value];
  const index = values.indexOf(id),
    next = index + delta;
  if (index < 0 || next < 0 || next >= values.length) return;
  [values[index], values[next]] = [values[next]!, values[index]!];
  order.value = values;
}
watch(order, (ids) => {
  for (const id of controls.keys()) if (!ids.includes(id)) controls.delete(id);
});
</script>

<template>
  <ReorderGroup v-model:values="order" as="div" axis="y" class="ordered-settings-list">
    <ReorderItem
      v-for="(id, index) in order"
      :key="id"
      :value="id"
      as="div"
      :drag-listener="!mobile"
      :drag-controls="controlsOf(id)"
      @drag-start="suppressOpenUntil = Infinity"
      @drag-end="suppressOpenUntil = Date.now() + 250"
    >
      <slot
        :id="id"
        :index="Number(index)"
        :open="() => open(id)"
        :grab="(event: PointerEvent) => controlsOf(id).start(event)"
        :move="(delta: number) => move(id, delta)"
      />
    </ReorderItem>
  </ReorderGroup>
</template>

<style scoped>
.ordered-settings-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  gap: 12px;
}
@media (max-width: 899px) {
  .ordered-settings-list {
    gap: 10px;
  }
}
</style>
