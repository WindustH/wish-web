<script setup lang="ts">
import { ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import Modal from '../../ui/components/Modal.vue';

defineProps<{ open: boolean; title: string; disabled?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const modal = ref<InstanceType<typeof Modal>>();
</script>

<template>
  <Modal ref="modal" :open="open" :title="title" content-class="tool-settings-dialog" @close="emit('close')">
    <fieldset class="settings-form" :disabled="disabled">
      <div class="set-card"><slot /></div>
    </fieldset>
    <template #footer>
      <span class="tool-settings-note">{{
        tr('更改随上一级设置一起保存。', 'Save changes in the parent settings.')
      }}</span>
      <button type="button" class="btn" @click="modal?.close()">{{ tr('完成', 'Done') }}</button>
    </template>
  </Modal>
</template>

<style>
.modal-card.tool-settings-dialog {
  --tool-settings-gutter: clamp(12px, 4vw, 22px);
  width: min(calc(100% - 24px), 34rem);
  max-height: min(calc(var(--viewport-height, 100dvh) - 32px), 43rem);
  border-color: var(--line);
  border-radius: 18px;
}
.tool-settings-dialog > .modal-head {
  padding: 10px var(--tool-settings-gutter) 8px;
  border-bottom: 0;
}
.tool-settings-dialog > .modal-body {
  padding: 0 var(--tool-settings-gutter) 12px;
}
.tool-settings-dialog > .modal-foot {
  align-items: center;
  padding: 0 var(--tool-settings-gutter) 14px;
  border-top: 0;
}
.tool-settings-dialog .set-row {
  grid-template-columns: minmax(0, 1fr) minmax(0, 8rem);
  column-gap: 12px;
}
.tool-settings-note {
  min-width: 0;
  margin-inline-end: auto;
  color: var(--fg-subtle);
  font-size: 12px;
}
</style>
