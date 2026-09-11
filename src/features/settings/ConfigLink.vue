<script setup lang="ts">
import { inject } from 'vue';
import { Pencil } from '@lucide/vue';
import { pointer } from '../../core/config-editor';
import { fieldHint, tr } from './fields';
import { openConfigDialog } from './config-dialog';
defineProps<{ path: string[]; title: string }>();
const open = inject(openConfigDialog)!;
</script>

<template>
  <div class="cfg-edit-row" :data-config-path="pointer(path)">
    <div><strong>{{ title }}</strong><p v-if="fieldHint(path)" class="cfg-hint">{{ fieldHint(path) }}</p></div>
    <button type="button" class="btn" :data-config-edit="pointer(path)" :aria-label="`${tr('编辑', 'Edit')} ${title}`" @click="open({ path, title })"><Pencil :size="15" />{{ tr('编辑', 'Edit') }}</button>
  </div>
</template>
