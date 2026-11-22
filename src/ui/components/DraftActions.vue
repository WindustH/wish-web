<script setup lang="ts">
import { inject } from 'vue';
import { draftActionsKey } from '../composables/draftActions.ts';
import { tr } from '../../core/i18n/tr.ts';
const actions = inject(draftActionsKey, null);
</script>
<template>
  <div v-if="actions?.dirty.value" class="draft-actions">
    <button
      type="button"
      class="btn ghost"
      :disabled="actions.busy.value"
      :aria-label="tr('丢弃修改', 'Discard changes')"
      :title="tr('丢弃修改', 'Discard changes')"
      @click="actions.discard"
    >
      {{ tr('放弃修改', 'Discard') }}
    </button>
    <button
      type="button"
      class="btn primary"
      :disabled="actions.busy.value"
      :aria-label="tr('保存修改', 'Save changes')"
      :title="tr('保存修改', 'Save changes')"
      @click="actions.save"
    >
      {{ actions.busy.value ? tr('保存中…', 'Saving…') : tr('保存', 'Save') }}
    </button>
  </div>
</template>
<style scoped>
.draft-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--line);
  padding: 10px 16px max(10px, env(safe-area-inset-bottom));
  flex: none;
}
.draft-actions .btn {
  min-height: 40px;
}
</style>
