<script setup lang="ts">
// One switch in a settings card: what it is, a line on what it does, and the switch.
import { SwitchRoot, SwitchThumb } from 'reka-ui';

defineProps<{ name: string; hint?: string; disabled?: boolean }>();
const on = defineModel<boolean>({ required: true });
</script>

<template>
  <div class="set-row inline toggle-row">
    <span class="set-label"><span>{{ name }}</span><small v-if="hint">{{ hint }}</small></span>
    <SwitchRoot v-model="on" class="cfg-switch" :aria-label="name" :disabled="disabled"><SwitchThumb class="cfg-switch-thumb" /></SwitchRoot>
  </div>
</template>
