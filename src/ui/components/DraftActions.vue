<script setup lang="ts">
import { inject } from 'vue';
import { draftActionsKey } from '../composables/draftActions.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from './Icon.vue';
const actions = inject(draftActionsKey, null);
</script>
<template>
  <div v-if="actions?.dirty.value" class="draft-actions">
    <button type="button" class="btn ghost icon-only" :disabled="actions.busy.value" :aria-label="tr('丢弃修改','Discard changes')" :title="tr('丢弃修改','Discard changes')" @click="actions.discard"><Icon name="undo" /></button>
    <button type="button" class="btn ghost icon-only draft-save" :disabled="actions.busy.value" :aria-label="tr('保存修改','Save changes')" :title="tr('保存修改','Save changes')" @click="actions.save"><Icon :name="actions.busy.value ? 'loader-circle' : 'save'" :class="{spin:actions.busy.value}" /></button>
  </div>
</template>
<style scoped>
.draft-actions { display: flex; align-items: center; gap: 2px; flex: none; }
.draft-actions .btn { width: 40px; min-height: 40px; }
.draft-save.btn { color: var(--accent); }
</style>
