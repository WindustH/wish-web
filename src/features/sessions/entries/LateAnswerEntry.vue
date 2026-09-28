<script setup lang="ts">
// Answers given after an `ask_user` call timed out reach the model as a message of their own,
// like a background command's report: a chip where it arrived, the answers behind it.
import { computed, ref } from 'vue';
import { i18n } from '../../../core/i18n/index.ts';
import { tr } from '../../../core/i18n/tr.ts';
import Icon from '../../../ui/components/Icon.vue';
import Markdown from '../../../ui/components/Markdown.vue';
import Modal from '../../../ui/components/Modal.vue';
import type { AnswerRecord } from '../askUser.ts';

const props = defineProps<{ item: any }>();
const open = ref(false);
const answers = computed<AnswerRecord[]>(() => props.item.entry.payload?.metadata?.answers ?? []);
const answerText = (answer: AnswerRecord) => answer.skipped ? null
  : answer.type === 'text' ? answer.text ?? ''
  : [...(answer.selected ?? []), ...(answer.other ? [answer.other] : [])].join(i18n.locale.value === 'zh' ? '、' : ', ');
</script>

<template>
  <div class="entry system">
    <div class="body">
      <button type="button" class="fold-chip" @click="open = true"><Icon name="question" />{{ tr('补充回答了之前的提问', 'Answered the earlier questions') }}</button>
      <Modal :open="open" compact :title="tr('补充的回答', 'Late answers')" content-class="late-answer-detail" @close="open = false">
        <p class="late-answer-intro">{{ tr('提问超时后给出的回答，作为一条消息发给了模型。', 'Given after the questions timed out, and sent to the model as a message.') }}</p>
        <dl class="question-summary">
          <template v-for="(answer, index) in answers" :key="index">
            <dt><Markdown class="question-text" :text="answer.question" /></dt>
            <dd :class="{ empty: answerText(answer) == null }">{{ answerText(answer) ?? tr('未回答', 'Not answered') }}</dd>
          </template>
        </dl>
        <template #footer><button type="button" class="btn ghost" @click="open = false">{{ tr('关闭', 'Close') }}</button></template>
      </Modal>
    </div>
  </div>
</template>

<style>
.modal-card.late-answer-detail:not(.modal-page) { width: min(92vw, 30rem); }
.late-answer-intro { margin: 0 0 12px; font-size: 12px; line-height: 1.6; color: var(--fg-subtle); }
</style>
