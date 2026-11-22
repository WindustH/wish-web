<script setup lang="ts">
import { ref, watch } from 'vue';
import { storageSessionPreview, type SessionExcerpt } from '../../core/api/endpoints.ts';
import { sessionTitle } from '../../core/state/sessionsSlice.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import Markdown from '../../ui/components/Markdown.vue';
import { useIsMobile } from '../../ui/composables/useMedia.ts';
import Modal from '../../ui/components/Modal.vue';
import Icon from '../../ui/components/Icon.vue';
import type { DataItem } from './DataRow.vue';

const props = defineProps<{ item: DataItem }>();
const emit = defineEmits<{ close: []; open: [] }>();
const mobile = useIsMobile();
const messages = ref<SessionExcerpt[]>([]);
const loading = ref(true),
  error = ref(''),
  revision = ref(0);
watch(
  [() => props.item.id, revision],
  async ([id], _, cleanup) => {
    const controller = new AbortController();
    cleanup(() => controller.abort());
    loading.value = true;
    messages.value = [];
    error.value = '';
    try {
      const result = await storageSessionPreview(id, { signal: controller.signal });
      if (!controller.signal.aborted) messages.value = result.messages;
    } catch (e) {
      if (!controller.signal.aborted) error.value = describeError(e).message;
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);
</script>
<template>
  <Modal
    :open="true"
    :sheet="mobile"
    :title="sessionTitle(item)"
    content-class="storage-preview-window"
    body-scroll="content"
    @close="emit('close')"
  >
    <template #actions>
      <button
        type="button"
        class="btn ghost icon-only"
        :aria-label="tr('打开会话', 'Open session')"
        :data-hint="tr('打开会话', 'Open session')"
        @click="emit('open')"
      >
        <Icon name="external-link" />
      </button>
    </template>
    <section
      class="storage-session-preview modal-scroll-region"
      :aria-label="tr('最近对话', 'Recent conversation')"
      :aria-busy="loading"
      tabindex="0"
      data-initial-focus
    >
      <p v-if="loading" class="preview-status" role="status">
        <Icon name="loader-circle" class="spin" /> {{ tr('正在读取…', 'Loading…') }}
      </p>
      <div v-else-if="error" class="preview-status" role="alert">
        {{ error }} <button class="btn sm" @click="revision++">{{ tr('重试', 'Retry') }}</button>
      </div>
      <p v-else-if="!messages.length" class="preview-status">
        {{ tr('暂无对话消息', 'No conversation messages yet.') }}
      </p>
      <article
        v-for="message in messages"
        :key="message.seq"
        class="entry"
        :class="message.role"
        :aria-label="message.role === 'user' ? tr('用户', 'User') : tr('助手', 'Assistant')"
      >
        <div v-if="message.role === 'user'" class="bubble">
          <template v-if="message.text.trim()">{{ message.text }}</template>
          <span v-else class="preview-no-text">{{ tr('非文字消息', 'Non-text message') }}</span>
        </div>
        <Markdown v-else-if="message.text.trim()" class="body" :text="message.text" plain-file-mentions />
        <span v-else class="preview-no-text">{{ tr('非文字消息', 'Non-text message') }}</span>
      </article>
    </section>
  </Modal>
</template>
<style scoped>
:global(.storage-preview-window:not(.modal-sheet)) {
  width: min(92vw, 40rem);
  max-height: min(calc(var(--viewport-height, 100dvh) * 0.78), 37rem);
  border: 0;
  border-radius: 16px;
}
:global(.storage-preview-window > .modal-head) {
  border-bottom: 0;
}
:global(.storage-preview-window .modal-title) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:global(.storage-preview-window > .modal-body) {
  padding: 0;
}
.storage-session-preview {
  --message-size: 0.9375rem;
  overflow: auto;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
  padding: 8px clamp(18px, 4vw, 36px) 24px;
}
.storage-session-preview:focus {
  outline: none;
}
article {
  padding-bottom: 16px;
}
article:last-child {
  padding-bottom: 0;
}
.entry.user .bubble {
  max-width: 86%;
  padding: 8px 12px;
}
.preview-status {
  margin: 0;
  padding: 24px 0;
  color: var(--fg-muted);
  text-align: center;
}
.preview-no-text {
  font-size: 0.8125rem;
  opacity: 0.72;
}
</style>
