<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { tr } from '../../core/i18n/tr.ts';
import { createWebsite } from '../../core/api/endpoints.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import Modal from '../../ui/components/Modal.vue';
const props = defineProps<{ session: string; parent: string | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const url = ref(''),
  name = ref(''),
  busy = ref(false),
  error = ref('');
const controller = new AbortController();
onBeforeUnmount(() => controller.abort());
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await createWebsite(
      props.session,
      { url: url.value.trim(), name: name.value.trim() || undefined, parent: props.parent },
      { signal: controller.signal },
    );
    if (!controller.signal.aborted) emit('saved');
  } catch (e) {
    if (!controller.signal.aborted) error.value = describeError(e).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Modal open compact :title="tr('添加本地网站', 'Add local website')" :dismissable="!busy" @close="emit('close')">
    <form class="website-form" @submit.prevent="save">
      <label
        >{{ tr('开发主机上的网址', 'URL on the development host')
        }}<input
          v-model="url"
          type="url"
          class="input"
          required
          data-initial-focus
          placeholder="http://localhost:5173/"
      /></label>
      <label
        >{{ tr('显示名称（可选）', 'Display name (optional)') }}<input v-model="name" class="input" maxlength="255"
      /></label>
      <p v-if="error" role="alert">{{ error }}</p>
      <button type="submit" class="btn primary" :disabled="busy || !url.trim()">{{ tr('添加', 'Add') }}</button>
    </form>
  </Modal>
</template>
<style scoped>
.website-form,
.website-form label {
  display: grid;
  gap: 8px;
}
.website-form {
  gap: 14px;
}
.website-form button {
  justify-self: end;
}
.website-form p {
  margin: 0;
  color: var(--err);
}
</style>
