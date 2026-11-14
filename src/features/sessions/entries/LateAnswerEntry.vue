<script setup lang="ts">
// Answers given after an `ask_user` call timed out reach the model as a message of their own,
// like a background command's report: a chip where it arrived, the answers behind it.
import { computed, inject, ref } from 'vue';
import { tr } from '../../../core/i18n/tr.ts';
import Icon from '../../../ui/components/Icon.vue';
import LateAnswerDialog from './LateAnswerDialog.vue';
import { openActivityKey } from '../activityDialogs.ts';
import type { AnswerRecord } from '../askUser.ts';

const props = defineProps<{ item: any }>();
const open = ref(false);
const openActivity = inject(openActivityKey, undefined);
function showAnswers() {
  if (openActivity)
    openActivity({
      chipKey: `late-answers:${props.item.entry.seq}`,
      stepKey: null,
      lateAnswers: answers.value.slice(),
    });
  else open.value = true;
}
const answers = computed<AnswerRecord[]>(() => props.item.entry.payload?.metadata?.answers ?? []);
</script>

<template>
  <div class="entry system">
    <div class="body">
      <button type="button" class="history-chip" @click="showAnswers">
        <Icon name="question" />{{ tr('补充回答了之前的提问', 'Answered the earlier questions') }}
      </button>
      <LateAnswerDialog v-if="open && !openActivity" :answers="answers" @close="open = false" />
    </div>
  </div>
</template>
