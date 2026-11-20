<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { signOut } from '../../core/connection.ts';
import { errorText } from '../../core/errors.ts';
import { tr } from '../../core/i18n/tr.ts';
import Spinner from '../../ui/components/Spinner.vue';

const props = defineProps<{ restore: (signal: AbortSignal) => Promise<void> }>();
const emit = defineEmits<{ ready: [] }>();
const busy = ref(false);
const error = ref('');
let retry: ReturnType<typeof setTimeout> | undefined;
let delay = 2000;
let controller = new AbortController();
const leaving = ref(false);

async function restore() {
  if (busy.value || controller.signal.aborted || document.hidden) return;
  clearTimeout(retry);
  busy.value = true;
  error.value = '';
  const { signal } = controller;
  try {
    await props.restore(signal);
    if (!signal.aborted) emit('ready');
  } catch (cause) {
    if (signal.aborted) return;
    error.value = errorText(cause);
    retry = setTimeout(restore, delay);
    delay = Math.min(30000, delay * 2);
  } finally {
    busy.value = false;
  }
}
async function switchAccount() {
  if (leaving.value) return;
  leaving.value = true;
  controller.abort();
  clearTimeout(retry);
  try {
    await signOut();
  } catch (cause) {
    controller = new AbortController();
    error.value = errorText(cause);
    leaving.value = false;
  }
}
onMounted(() => {
  void restore();
  window.addEventListener('online', restore);
  document.addEventListener('visibilitychange', restore);
});
onBeforeUnmount(() => {
  controller.abort();
  clearTimeout(retry);
  window.removeEventListener('online', restore);
  document.removeEventListener('visibilitychange', restore);
});
</script>

<template>
  <main class="ssh-startup">
    <div v-if="!error" role="status"><Spinner />{{ tr('正在连接 SSH…', 'Connecting to SSH…') }}</div>
    <p v-else role="alert">{{ error }}</p>
    <div>
      <button v-if="error" class="btn" :disabled="busy || leaving" @click="restore">{{ tr('重试', 'Retry') }}</button>
      <button class="btn ghost" :disabled="leaving" @click="switchAccount">
        {{ tr('切换账户', 'Switch account') }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.ssh-startup {
  height: 100dvh;
  display: grid;
  place-content: center;
  justify-items: center;
  padding: 24px;
  gap: 12px;
}
.ssh-startup div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ssh-startup p {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
