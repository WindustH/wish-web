<script setup lang="ts">
// Choosing one thing from a searchable list in a dialog. On a phone it is a page and a tap chooses
// at once; on a desktop it is a card, a click marks the choice and Add confirms it.
import { ref } from 'vue';
import Modal from './Modal.vue';
import PickerList, { type PickerItem } from './PickerList.vue';
import { useIsMobile } from '../composables/useMedia.ts';
import { tr } from '../../core/i18n/tr.ts';

defineProps<{
  title: string;
  items: PickerItem[];
  placeholder: string;
}>();
const emit = defineEmits<{ close: []; choose: [key: string] }>();
const isMobile = useIsMobile();
const selected = ref('');
</script>

<template>
  <Modal :page="isMobile" :open="true" body-scroll="content" content-class="picker-dialog" compact :title="title" @close="emit('close')">
    <PickerList class="modal-scroll-region" v-model="selected" :items="items" :placeholder="placeholder" @select="key => { if (isMobile) emit('choose', key); }" />
    <slot />
    <template v-if="!isMobile || $slots['footer-start']" #footer>
      <div class="picker-dialog-actions">
        <slot name="footer-start" />
        <template v-if="!isMobile">
          <button type="button" class="btn ghost" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
          <button type="button" class="btn primary" :disabled="!selected" @click="emit('choose', selected)">{{ tr('添加', 'Add') }}</button>
        </template>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.picker-dialog-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; width: 100%; }
@media (max-width: 899px) {
  :global(.picker-dialog.modal-page .picker-viewport) { height: auto !important; flex: 1; }
}
</style>
