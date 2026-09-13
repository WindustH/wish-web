<script setup lang="ts">
import { ref } from 'vue';
import { Plus } from '@lucide/vue';
import Modal from '../../ui/components/Modal.vue';
import PickerList from '../../ui/components/PickerList.vue';
import { tr } from './fields';
defineProps<{ options: Array<{ value: string; label: string }> }>();
const emit = defineEmits<{ add: [field: string] }>();
const open = ref(false);
const modal = ref<InstanceType<typeof Modal>>();
let selected: string | undefined;
function add(field: string) {
  selected = field;
  modal.value?.close();
}
function closed() {
  open.value = false;
  if (selected !== undefined) { const field = selected; selected = undefined; emit('add', field); }
}
</script>

<template>
  <div v-if="options.length" class="cfg-add-field">
    <button type="button" class="btn" @click="open = true"><Plus :size="16" />{{ tr('添加可选设置', 'Add optional setting') }}</button>
    <Modal ref="modal" :open="open" :title="tr('添加可选设置', 'Add optional setting')" @close="closed">
      <PickerList v-if="open" :items="options.map(option => ({ key: option.value, title: option.label, search: option.value }))" :icons="false" :placeholder="tr('搜索设置…', 'Search settings…')" @select="add" />
    </Modal>
  </div>
</template>

<style scoped>
.cfg-add-field > .btn { justify-self: start; }
</style>
