<script setup lang="ts">
// Account status as a window over the app, opened from the desktop navigation bar.
import { watch } from 'vue';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import { tr } from '../../core/i18n/tr.ts';
import RefreshStamp from '../../ui/components/RefreshStamp.vue';
import AccountStatus from './AccountStatus.vue';
import { useAccountStates } from './useAccountStates.ts';

const props = defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();
const { rows, unconfigured, loading, error, checkedAt, refresh } = useAccountStates();
// Each opening reads again; the last readings stay on screen meanwhile.
watch(() => props.open, open => { if (open) void refresh(); }, { immediate: true });
</script>

<template>
  <Modal compact :open="open" content-class="account-window" :title="tr('账户状态', 'Account status')" @close="$emit('close')">
    <template #compact-heading>
      <div class="dialog-topline">
        <h2>{{ tr('账户状态', 'Account status') }}</h2>
        <div class="dialog-toolbar">
          <RefreshStamp :at="checkedAt" :loading="loading" @refresh="refresh" />
          <button type="button" class="btn ghost icon-only" :aria-label="tr('关闭', 'Close')" :data-hint="tr('关闭', 'Close')" @click="$emit('close')"><Icon name="x" /></button>
        </div>
      </div>
    </template>
    <AccountStatus :rows="rows" :unconfigured="unconfigured" :loading="loading" :error="error" />
  </Modal>
</template>

<style>
.modal-card.account-window:not(.modal-page) { width: min(92vw, 34rem); }
.modal-card.account-window.compact .modal-body { padding-bottom: 16px; }
</style>
