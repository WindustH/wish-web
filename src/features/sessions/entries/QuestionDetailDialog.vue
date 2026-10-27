<script setup lang="ts">
import type { QuestionDetail } from '../activityDialogs.ts';
import { answerText } from '../askUser.ts';
import Modal from '../../../ui/components/Modal.vue';
import Icon from '../../../ui/components/Icon.vue';
import Markdown from '../../../ui/components/Markdown.vue';
import { tr } from '../../../core/i18n/tr.ts';
defineProps<{ detail: QuestionDetail }>();
defineEmits<{ close: [] }>();
</script>
<template>
  <Modal
    :open="true"
    compact
    content-class="question-detail-window"
    :title="tr('提问与回答', 'Questions and answers')"
    @close="$emit('close')"
  >
    <template #compact-heading
      ><div class="dialog-topline">
        <h2>{{ tr('提问与回答', 'Questions and answers') }}</h2>
        <small>{{ detail.status }}</small>
        <div class="dialog-toolbar">
          <button class="btn ghost icon-only" :aria-label="tr('关闭', 'Close')" @click="$emit('close')">
            <Icon name="x" />
          </button>
        </div></div
    ></template>
    <section v-for="(question, index) in detail.questions" :key="index" class="recorded-question">
      <small v-if="question.header">{{ question.header }}</small>
      <Markdown class="recorded-question-text" :text="question.question" />
      <template v-if="question.type === 'choice'">
        <p class="recorded-choice-kind">
          {{ question.multi_select ? tr('可多选', 'Multiple choices') : tr('单选', 'Single choice') }}
        </p>
        <ul class="recorded-options">
          <li
            v-for="option in question.options"
            :key="option.label"
            :class="{ selected: detail.answers?.[index]?.selected?.includes(option.label) }"
          >
            <Icon v-if="detail.answers?.[index]?.selected?.includes(option.label)" name="check" />
            <div>
              <strong>{{ option.label }}</strong>
              <p v-if="option.description">{{ option.description }}</p>
            </div>
          </li>
        </ul>
        <p v-if="question.allow_other" class="recorded-choice-kind">
          {{ tr('也可填写其他回答', 'A custom answer was also allowed') }}
        </p>
      </template>
      <div class="recorded-answer">
        <small>{{ tr('你的回答', 'Your answer') }}</small>
        <p>{{ answerText(detail.answers?.[index]) ?? tr('未回答', 'Not answered') }}</p>
      </div>
    </section>
  </Modal>
</template>
<style scoped>
:global(.modal-card.question-detail-window) {
  width: min(680px, calc(100vw - 32px));
}
:global(.question-detail-window.compact .modal-body) {
  padding: 14px 16px 16px;
}
.dialog-topline > small {
  color: var(--fg-subtle);
}
.recorded-question {
  min-width: 0;
  overflow-wrap: anywhere;
}
.recorded-options li > div {
  min-width: 0;
}
.recorded-question + .recorded-question {
  border-top: 1px solid var(--line);
  padding-top: 16px;
  margin-top: 16px;
}
.recorded-question > small,
.recorded-answer > small,
.recorded-choice-kind {
  color: var(--fg-subtle);
  font-size: 12px;
}
.recorded-question-text {
  font-size: 14px;
}
.recorded-options {
  list-style: none;
  display: grid;
  gap: 6px;
  padding: 0;
  margin: 8px 0;
}
.recorded-options li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 13px;
}
.recorded-options li.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.recorded-options .icon {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--accent);
}
.recorded-options strong {
  font-weight: 500;
}
.recorded-options p {
  margin: 4px 0 0;
  color: var(--fg-muted);
}
.recorded-answer {
  margin-top: 12px;
}
.recorded-answer p {
  margin: 4px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
}
</style>
