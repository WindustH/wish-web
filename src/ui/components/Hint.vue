<script setup lang="ts">
import { ref, watch } from 'vue';
import { TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent } from 'reka-ui';
import { usePageActivity } from '../composables/usePageActivity.ts';
const pageActive = usePageActivity();
const open = ref(false);
watch(pageActive, active => { if (!active) open.value = false; });
defineProps<{ text?: string }>();
</script>

<template>
  <TooltipRoot v-model:open="open" :disabled="!text || !pageActive" ignore-non-keyboard-focus>
    <TooltipTrigger as-child><slot /></TooltipTrigger>
    <TooltipPortal v-if="pageActive">
      <TooltipContent class="control-tooltip" :side-offset="7" :collision-padding="10">{{ text }}</TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
