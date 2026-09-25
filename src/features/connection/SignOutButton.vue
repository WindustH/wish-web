<script setup lang="ts">
// Leaves the current server; the sign-in page then connects to this one or another.
import { ref } from 'vue';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import Modal from '../../ui/components/Modal.vue';
import { tr } from '../../core/i18n/tr.ts';
import { serverName, signOut } from '../../core/connection.ts';

defineProps<{ buttonClass?: string }>();
const confirming = ref(false);
const busy = ref(false);
const label = () => tr(`退出 ${serverName()}`, `Sign out of ${serverName()}`);
async function leave() {
  busy.value = true;
  await signOut();
}
</script>

<template>
  <Hint :text="label()"><button type="button" :class="buttonClass" :aria-label="label()" @click="confirming = true"><Icon name="log-out" /></button></Hint>
  <Modal compact :open="confirming" :dismissable="!busy" :title="tr('退出当前服务器？', 'Sign out of this server?')" @close="confirming = false">
    <p>{{ tr(`将断开与 ${serverName()} 的连接，并清除这个浏览器缓存的数据。之后可以重新连接它，或连接其他 Wish 服务器。`, `This disconnects from ${serverName()} and clears the data this browser cached. You can then connect to it again or to another Wish server.`) }}</p>
    <template #footer>
      <button class="btn ghost" :disabled="busy" @click="confirming = false">{{ tr('取消', 'Cancel') }}</button>
      <button class="btn danger" :disabled="busy" @click="leave">{{ tr('退出', 'Sign out') }}</button>
    </template>
  </Modal>
</template>
