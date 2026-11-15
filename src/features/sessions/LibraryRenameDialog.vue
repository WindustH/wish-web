<script setup lang="ts">
import { ref, useId, watch } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import Modal from '../../ui/components/Modal.vue';
const props = defineProps<{
  open: boolean;
  name: string;
  save: (name: string, signal: AbortSignal) => Promise<unknown>;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const form = useId(),
  name = ref(''),
  busy = ref(false),
  error = ref('');
let controller: AbortController | undefined;
watch(
  [() => props.open, () => props.name],
  (_, __, cleanup) => {
    name.value = props.name;
    busy.value = false;
    error.value = '';
    controller?.abort();
    cleanup(() => controller?.abort());
  },
  { immediate: true },
);
async function submit() {
  if (busy.value || !name.value.trim()) return;
  const request = new AbortController();
  controller = request;
  busy.value = true;
  error.value = '';
  try {
    await props.save(name.value.trim(), request.signal);
    if (!request.signal.aborted) {
      emit('saved');
      emit('close');
    }
  } catch (cause) {
    if (!request.signal.aborted) error.value = describeError(cause).message;
  } finally {
    if (controller === request) busy.value = false;
  }
}
</script>
<template>
  <Modal :open="open" compact :title="tr('重命名', 'Rename')" :dismissable="!busy" @close="emit('close')">
    <form :id="form" class="library-rename-form" @submit.prevent="submit">
      <input
        v-model="name"
        class="input"
        :disabled="busy"
        maxlength="255"
        data-initial-focus
        :aria-label="tr('显示名称', 'Display name')"
      />
      <p class="muted">{{ tr('仅修改库中的显示名称。', 'Only changes the display name in the Library.') }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn primary" type="submit" :form="form" :disabled="busy || !name.trim()">
        {{ tr('保存', 'Save') }}
      </button>
    </template>
  </Modal>
</template>
<style scoped>
.library-rename-form {
  display: grid;
  gap: 12px;
}
.library-rename-form .input {
  width: 100%;
}
.library-rename-form p {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
}
.library-rename-form [role='alert'] {
  color: var(--err);
}
</style>
