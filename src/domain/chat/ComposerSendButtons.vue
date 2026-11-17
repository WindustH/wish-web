<script setup lang="ts">
// During a run, an empty draft offers stop; a populated draft offers queue-send instead.
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import { useShortcutHint } from '../../ui/composables/useShortcutHint.ts';
import { i18n } from '../../core/i18n/index.ts';

defineProps<{ running: boolean; sending: boolean; canSend: boolean; queueable: boolean; showShortcut: boolean }>();
const shortcut = useShortcutHint('interruptReply');
const emit = defineEmits<{ send: []; stop: [] }>();
</script>

<template>
  <Hint v-if="queueable" :text="i18n.t('chat.queueSend')"
    ><button class="send-btn" :disabled="sending" :aria-label="i18n.t('chat.queueSend')" @click="emit('send')">
      <Icon v-if="sending" name="loader-circle" class="spin" /><Icon v-else name="send" /></button
  ></Hint>
  <Hint
    v-else
    :text="
      running
        ? `${i18n.t('chat.stop')}${showShortcut && shortcut.label.value ? ` (${shortcut.label.value})` : ''}`
        : i18n.t('chat.send')
    "
    ><button
      :aria-keyshortcuts="running && showShortcut ? shortcut.aria.value : undefined"
      class="send-btn"
      :class="{ stop: running }"
      :disabled="sending || (!running && !canSend)"
      :aria-label="i18n.t(running ? 'chat.stop' : 'chat.send')"
      @click="running ? emit('stop') : emit('send')"
    >
      <Icon v-if="sending" name="loader-circle" class="spin" />
      <Icon v-else :name="running ? 'square' : 'send'" /></button
  ></Hint>
</template>
