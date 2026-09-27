<script setup lang="ts">
// Account status as a window over the app, opened from the desktop navigation bar.
import Modal from '../../ui/components/Modal.vue';
import { tr } from '../../core/i18n/tr.ts';
import AccountStatus from './AccountStatus.vue';

defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <Modal :open="open" content-class="account-window" :title="tr('账户状态', 'Account status')" @close="$emit('close')">
    <AccountStatus v-if="open" />
  </Modal>
</template>

<style>
.modal-card.account-window:not(.modal-page) { width: min(92vw, 34rem); }
</style>
