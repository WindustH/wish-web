<script setup lang="ts">
import { computed } from 'vue';
import type { PendingMessage } from '../../core/state/pendingMessages.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ message: PendingMessage; compact?: boolean; busy?: boolean }>();
const emit = defineEmits<{ edit: [id: string]; remove: [id: string]; retry: [id: string]; check: [] }>();
const text = computed(() => {
  let value = props.message.draft.text;
  for (const item of props.message.draft.attachments)
    if (item.placeholder) value = value.replaceAll(item.placeholder, '');
  return value.trim();
});
const label = computed(
  () =>
    ({
      waiting: tr('等待发送', 'Waiting to send'),
      uploading: tr('正在上传附件…', 'Uploading attachments…'),
      sending: tr('正在发送…', 'Sending…'),
      acked: tr('服务器已接收', 'Received by server'),
      failed: props.message.uncertain
        ? tr('暂时无法确认是否送达', 'Delivery could not be confirmed')
        : tr('发送失败', 'Send failed'),
    })[props.message.state],
);
</script>

<template>
  <article class="pending-message" :class="{ compact }" :data-state="message.state">
    <div class="pending-content">
      <div v-if="text" class="pending-text">{{ text }}</div>
      <div v-if="message.draft.attachments.length" class="pending-attachments">
        <template v-for="(item, index) in message.draft.attachments" :key="index">
          <img v-if="item.localUrl && !compact && !item.reply" :src="item.localUrl" :alt="item.name ?? ''" />
          <span v-else class="pending-file"
            ><Icon :name="item.reply ? 'quote' : item.kind === 'image' ? 'image' : 'paperclip'" :size="14" />{{
              item.name || tr('附件', 'Attachment')
            }}</span
          >
        </template>
      </div>
    </div>
    <div class="pending-state" role="status">
      {{ label }}<template v-if="message.error"> · {{ describeError(message.error).message }}</template>
    </div>
    <div v-if="message.state === 'failed'" class="pending-actions">
      <button v-if="message.retryable" class="btn sm" :disabled="busy" @click="emit('retry', message.id)">
        {{ tr('重试发送', 'Retry sending') }}
      </button>
      <button v-if="message.uncertain" class="btn ghost sm" :disabled="busy" @click="emit('check')">
        {{ tr('核对送达状态', 'Check delivery') }}
      </button>
      <button class="btn ghost sm" :disabled="busy" @click="emit('edit', message.id)">
        {{ tr('退回输入框', 'Return to composer') }}
      </button>
      <button class="btn ghost sm" :disabled="busy" @click="emit('remove', message.id)">
        {{ tr('移除此提示', 'Dismiss this item') }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.pending-message {
  display: grid;
  justify-items: end;
  margin: 12px 0;
  gap: 5px;
}
.pending-content {
  max-width: 92%;
  min-width: 0;
  padding: 12px 16px;
  border-radius: 13px;
  background: var(--bg-group);
}
.pending-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pending-attachments,
.pending-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pending-text + .pending-attachments {
  margin-top: 8px;
}
.pending-attachments img {
  max-width: min(100%, 260px);
  max-height: 200px;
  object-fit: contain;
  border-radius: 9px;
}
.pending-file {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  overflow-wrap: anywhere;
}
.pending-state {
  color: var(--fg-subtle);
  text-align: end;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.pending-message[data-state='failed'] .pending-state {
  color: var(--err);
}
.pending-message.compact {
  justify-items: start;
  margin-inline: 8px;
}
.compact .pending-content {
  max-width: 100%;
  padding: 6px 9px;
}
.compact .pending-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.compact .pending-state {
  text-align: start;
}
</style>
