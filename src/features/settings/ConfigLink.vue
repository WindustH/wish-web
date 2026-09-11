<script setup lang="ts">
import { computed, inject } from 'vue';
import { Pencil } from '@lucide/vue';
import ProviderIcon from '../../ui/components/ProviderIcon.vue';
import { pointer } from '../../core/config-editor';
import { fieldHint, tr } from './fields';
import { openConfigDialog } from './config-dialog';
const props = defineProps<{ path: string[]; title: string; brand?: string }>();
const hint = computed(() => /^\d+$/.test(props.path.at(-1)!) ? '' : fieldHint(props.path));
const open = inject(openConfigDialog)!;
</script>

<template>
  <div class="cfg-edit-row" :data-config-path="pointer(path)">
    <div><strong class="cfg-edit-title"><ProviderIcon v-if="brand" :brand="brand" /><span>{{ title }}</span></strong><p v-if="hint" class="cfg-hint">{{ hint }}</p></div>
    <button type="button" class="btn" :data-config-edit="pointer(path)" :aria-label="`${tr('编辑', 'Edit')} ${title}`" @click="open({ path, title })"><Pencil :size="15" />{{ tr('编辑', 'Edit') }}</button>
  </div>
</template>
