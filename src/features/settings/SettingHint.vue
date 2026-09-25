<script setup lang="ts">
import { ref, watch } from 'vue';
import { Info } from '@lucide/vue';
import { TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent } from 'reka-ui';
import { usePageActivity } from '../../ui/composables/usePageActivity.ts';
import { tr } from './fields.ts';

defineProps<{ id?: string; text: string; label?: string }>();
const open = ref(false);
const active = usePageActivity();
watch(active, value => { if (!value) open.value = false; });
</script>

<template>
  <p :id="id" class="cfg-hint setting-help-text">{{ text }}</p>
  <TooltipRoot v-model:open="open" :disabled="!active" :delay-duration="180" disable-closing-trigger ignore-non-keyboard-focus>
    <TooltipTrigger as-child><button type="button" class="setting-help-icon" :aria-label="label ? `${label}：${tr('说明', 'Help')}` : tr('说明', 'Help')" @click="open = !open"><Info :size="15" /></button></TooltipTrigger>
    <TooltipPortal v-if="active"><TooltipContent class="control-tooltip setting-help-popup" :side-offset="6" :collision-padding="12">{{ text }}</TooltipContent></TooltipPortal>
  </TooltipRoot>
</template>
