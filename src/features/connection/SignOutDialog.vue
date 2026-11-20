<script setup lang="ts">
// Asks before leaving the current server; the sign-in page then connects to this one or another.
import { ref } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import { tr } from '../../core/i18n/tr.ts';
import { serverName, signOut } from '../../core/connection.ts';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const busy = ref(false);
async function leave() {
  busy.value = true;
  await signOut();
}
</script>

<template>
  <Modal
    compact
    :open="open"
    :dismissable="!busy"
    :title="tr('退出当前服务器？', 'Sign out of this server?')"
    @close="emit('close')"
  >
    <p>
      {{
        tr(
          `将断开与 ${serverName()} 的连接。账户和缓存会保留在这台设备上，你可以选择账户重新登录。`,
          `This disconnects from ${serverName()}. Your accounts and cache stay on this device. Choose an account to sign in again.`,
        )
      }}
    </p>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="emit('close')">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn danger" :disabled="busy" @click="leave">{{ tr('退出', 'Sign out') }}</button>
    </template>
  </Modal>
</template>
