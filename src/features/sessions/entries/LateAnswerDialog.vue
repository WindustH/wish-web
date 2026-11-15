<script setup lang="ts">
import { tr } from '../../../core/i18n/tr.ts';
import Modal from '../../../ui/components/Modal.vue';
import { useIsMobile } from '../../../ui/composables/useMedia.ts';
import AnswerSummary from './AnswerSummary.vue';
import type { AnswerRecord } from '../askUser.ts';
const isMobile = useIsMobile();
defineProps<{ answers: AnswerRecord[] }>();
const emit = defineEmits<{ close: [] }>();
</script>
<template>
  <Modal
    :open="true"
    :sheet="isMobile"
    compact
    :title="tr('补充的回答', 'Late answers')"
    content-class="late-answer-detail"
    @close="emit('close')"
  >
    <p class="late-answer-intro">
      {{
        tr(
          '提问超时后给出的回答，作为一条消息发给了模型。',
          'Given after the questions timed out, and sent to the model as a message.',
        )
      }}
    </p>
    <AnswerSummary :questions="answers" :answers="answers" />
    <template #footer
      ><button type="button" class="btn ghost" @click="emit('close')">{{ tr('关闭', 'Close') }}</button></template
    >
  </Modal>
</template>
<style>
.modal-card.late-answer-detail:not(.modal-page) {
  width: min(92vw, 30rem);
}
.late-answer-intro {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--fg-subtle);
}
</style>
