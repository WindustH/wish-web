<script setup lang="ts">
// The composer's send button, which stops the run while one goes on, and beside it, while a run
// goes on and something is typed, the button that queues it instead.
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import { i18n } from '../../core/i18n/index.ts';

defineProps<{ running: boolean; sending: boolean; canSend: boolean; queueable: boolean; escapeStops: boolean }>();
const emit = defineEmits<{ send: []; stop: [] }>();
</script>

<template>
  <Hint v-if="queueable" :text="i18n.t('chat.queueSend')"><button class="send-btn" :disabled="sending"
    :aria-label="i18n.t('chat.queueSend')" @click="emit('send')">
    <Icon v-if="sending" name="loader-circle" class="spin" /><Icon v-else name="send" />
  </button></Hint>
  <Hint :text="running ? `${i18n.t('chat.stop')}${escapeStops ? ' (Esc)' : ''}` : i18n.t('chat.send')"><button :aria-keyshortcuts="running && escapeStops ? 'Escape' : undefined" class="send-btn" :class="{ stop: running }" :disabled="sending || (!running && !canSend)"
    :aria-label="i18n.t(running ? 'chat.stop' : 'chat.send')"
    @click="running ? emit('stop') : emit('send')">
    <Icon v-if="sending" name="loader-circle" class="spin" />
    <Icon v-else :name="running ? 'square' : 'send'" />
  </button></Hint>
</template>
