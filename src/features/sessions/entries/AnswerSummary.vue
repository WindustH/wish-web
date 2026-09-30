<script setup lang="ts">
// The questions an ask_user form asked, each with the answer it got; before any answer, the
// questions alone, compact.
import Markdown from '../../../ui/components/Markdown.vue';
import { answerText, type AnswerRecord } from '../askUser.ts';
import { tr } from '../../../core/i18n/tr.ts';

defineProps<{ questions: { header?: string; question: string }[]; answers?: readonly (AnswerRecord | undefined)[] | null }>();
</script>

<template>
  <dl class="question-summary" :class="{ compact: !answers }">
    <template v-for="(question, index) in questions" :key="index">
      <dt><span v-if="question.header" class="question-header">{{ question.header }}</span><Markdown class="question-text" :text="question.question" /></dt>
      <dd v-if="answers" :class="{ empty: answerText(answers[index]) == null }">{{ answerText(answers[index]) ?? tr('未回答', 'Not answered') }}</dd>
    </template>
  </dl>
</template>

<style>
.question-summary { display: grid; gap: 4px; margin: 10px 0 0; }
.question-summary dt { margin-top: 8px; }
.question-summary dt:first-child { margin-top: 0; }
.question-summary .question-text { margin: 0; font-size: 13px; color: var(--fg-muted); }
.question-summary dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; font-weight: 500; }
.question-summary dd.empty { color: var(--fg-faint); font-style: italic; font-weight: 400; }
/* Nothing was answered: the questions alone, as a short list. */
.question-summary.compact dt { margin-top: 2px; }
.question-summary.compact .question-header { display: none; }
.question-summary.compact .question-text { color: var(--fg-subtle); }
</style>
