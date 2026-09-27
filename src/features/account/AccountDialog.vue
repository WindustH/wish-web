<script setup lang="ts">
// Account status as a window over the app, opened from the desktop navigation bar.
import { watch } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import { tr } from '../../core/i18n/tr.ts';
import AccountRefresh from './AccountRefresh.vue';
import AccountStatus from './AccountStatus.vue';
import { useAccountStates } from './useAccountStates.ts';

const props = defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();
const { rows, unconfigured, loading, error, checkedAt, refresh } = useAccountStates();
// Each opening reads again; the last readings stay on screen meanwhile.
watch(() => props.open, open => { if (open) void refresh(); }, { immediate: true });
</script>

<template>
  <Modal :open="open" content-class="account-window" :title="tr('账户状态', 'Account status')" @close="$emit('close')">
    <template #actions><AccountRefresh :checked-at="checkedAt" :loading="loading" @refresh="refresh" /></template>
    <AccountStatus :rows="rows" :unconfigured="unconfigured" :loading="loading" :error="error" />
  </Modal>
</template>

<style>
.modal-card.account-window:not(.modal-page) { width: min(92vw, 34rem); }
</style>
