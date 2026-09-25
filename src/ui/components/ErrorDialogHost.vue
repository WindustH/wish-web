<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { tr } from '../../core/i18n/tr';
import { dismissError, useErrorReports } from '../errorDialog';

const reports = useErrorReports();
const report = computed(() => reports.value[0]);
const modal = ref<InstanceType<typeof Modal>>();

async function act() {
  const action = report.value?.action;
  await modal.value?.close();
  action?.run();
}
</script>

<template>
  <!-- Above settings (51), editor pages (60+) and the unsaved-changes prompt (120). -->
  <Modal v-if="report" ref="modal" :key="report.id" compact :layer="200" content-class="error-dialog" :open="true" :title="report.title" @close="dismissError(report.id)">
    <template #compact-heading>
      <div class="error-dialog-head" aria-hidden="true"><span class="error-dialog-icon"><Icon name="triangle-alert" /></span><span>{{ report.title }}</span></div>
    </template>
    <p class="error-dialog-message" role="alert">{{ report.message }}</p>
    <p v-if="report.hint" class="error-dialog-hint">{{ report.hint }}</p>
    <details v-if="report.original" class="error-dialog-original">
      <summary>{{ tr('原始信息', 'Original message') }}<Icon name="chevron-down" /></summary>
      <code>{{ report.original }}</code>
    </details>
    <template #footer>
      <button v-if="report.action" type="button" class="btn" @click="act">{{ report.action.label }}</button>
      <button type="button" class="btn primary" @click="modal?.close()">{{ tr('知道了', 'OK') }}</button>
    </template>
  </Modal>
</template>

<style>
.modal-card.error-dialog { width: min(92vw, 25rem); }
.error-dialog .modal-body { padding: 20px 20px 4px; }
.error-dialog .modal-actions { padding: 16px 20px 18px; }
.error-dialog-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; font: 600 16px/1.4 var(--font); }
.error-dialog-icon { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 50%; background: var(--err-bg); color: var(--err); box-shadow: inset 0 0 0 1px var(--err-border); }
.error-dialog-icon .icon { width: 18px; height: 18px; }
.error-dialog-message { margin: 0; font-size: 14px; line-height: 1.7; color: var(--fg); overflow-wrap: anywhere; }
.error-dialog-hint { margin: 8px 0 0; font-size: 13px; line-height: 1.6; color: var(--fg-subtle); }
.error-dialog-original { margin-top: 14px; border-top: 1px solid var(--line); }
.error-dialog-original > summary { display: flex; align-items: center; gap: 4px; width: fit-content; padding: 10px 0 2px; font-size: 12px; color: var(--fg-subtle); cursor: pointer; list-style: none; }
.error-dialog-original > summary::-webkit-details-marker { display: none; }
.error-dialog-original > summary .icon { width: 13px; height: 13px; transition: transform var(--dur-fast); }
.error-dialog-original[open] > summary .icon { transform: rotate(180deg); }
.error-dialog-original > code { display: block; margin-top: 8px; padding: 10px 12px; border-radius: 8px; background: var(--bg-sunken); color: var(--fg-muted); font: 12px/1.6 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 30dvh; overflow: auto; }
@media (max-width: 599px) {
  .error-dialog .modal-actions .btn { flex: 1; min-height: 42px; }
}
</style>
