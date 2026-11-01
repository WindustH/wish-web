<script setup lang="ts">
import { DialogRoot, DialogContent, DialogOverlay, DialogTitle } from 'reka-ui';
import Icon from './Icon.vue';
import { i18n } from '../../core/i18n/index.ts';
import { useDialogFocus } from '../composables/useDialogFocus.ts';

defineProps<{ title: string; overlay?: boolean }>();
const emit = defineEmits<{ close: []; back: [] }>();
const focus = useDialogFocus();
</script>

<template>
  <DialogRoot :modal="!!overlay" :open="true" @update:open="!$event && emit('close')">
    <DialogOverlay v-if="overlay" class="island-scrim" @click="emit('close')" />
    <DialogContent
      id="session-sidebar"
      class="island-sidebar"
      :class="{ 'island-overlay': overlay }"
      :aria-describedby="undefined"
      :disable-outside-pointer-events="false"
      @open-auto-focus="focus.opened"
      @close-auto-focus="focus.closed"
      @interact-outside.prevent
      @escape-key-down.prevent="emit('back')"
    >
      <header class="island-heading">
        <slot name="leading" />
        <DialogTitle class="island-title"
          ><slot name="title">{{ title }}</slot></DialogTitle
        >
        <div class="island-actions"><slot name="actions" /></div>
        <button class="btn ghost icon-only" :aria-label="i18n.t('common.close')" @click="emit('close')">
          <Icon name="x" />
        </button>
      </header>
      <div class="island-body"><slot /></div>
      <slot name="footer" />
    </DialogContent>
  </DialogRoot>
</template>

<style scoped>
.island-sidebar {
  position: relative;
  z-index: 20;
  flex: 0 0 clamp(320px, 34vw, 460px);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line);
  background: var(--bg);
  overflow: hidden;
  outline: none;
}
.island-heading {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 4px 8px 4px 12px;
}
.island-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 14px/1.5 var(--font);
}
.island-actions {
  display: flex;
  align-items: center;
}
.island-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.island-scrim {
  position: absolute;
  inset: 0;
  z-index: 19;
  background: var(--scrim);
}
.island-overlay {
  position: absolute;
  inset: 0;
  border-left: none;
}
@media (prefers-reduced-motion: no-preference) {
  .island-sidebar {
    animation: island-in 180ms var(--ease-out);
  }
  @keyframes island-in {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
  }
}
</style>
