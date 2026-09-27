<script setup lang="ts">
// An `ask_user` call: the form while the call waits (or, after a timeout, while it still takes
// a late answer), and what became of it afterwards.
import { computed, onUnmounted, ref, watch } from 'vue';
import * as api from '../../../core/api/endpoints.ts';
import { chat } from '../../../core/state/chatSlice.ts';
import { i18n } from '../../../core/i18n/index.ts';
import { tr } from '../../../core/i18n/tr.ts';
import Icon from '../../../ui/components/Icon.vue';
import Markdown from '../../../ui/components/Markdown.vue';
import { showError } from '../../../ui/errorDialog.ts';
import { toast } from '../../../ui/toast.ts';
import { type AnswerRecord, type Draft, draftAnswered, draftAnswers, emptyDraft, formState, pick, readForm } from '../askUser.ts';
import type { QuestionItem } from '../grouping.ts';
import type { EntryView } from '../../../core/api/projections.ts';

const props = defineProps<{ item: QuestionItem<EntryView>; session?: string }>();

const questions = computed(() => readForm(props.item.arguments));
const snapshot = computed(() => chat.snapshot.value?.id === props.session ? chat.snapshot.value : null);
const pending = computed(() => snapshot.value?.pending_questions ?? []);
const running = computed(() => snapshot.value?.phase === 'running' || !!chat.stream.value?.active);
const state = computed(() => formState(props.item, pending.value, running.value));

// Drafts outlive the card: the list recycles rows that scroll away.
const key = `${props.session}:${props.item.callId}`;
const drafts = ref<Draft[]>(stored.get(key) ?? questions.value.map(emptyDraft));
watch(drafts, value => stored.set(key, value), { deep: true });

// Answers sent but not yet reflected in the history.
const sent = ref<AnswerRecord[] | 'skipped' | null>(null);
const sending = ref(false);
const answerable = computed(() => !sent.value && (state.value.kind === 'open' || (state.value.kind === 'timed_out' && state.value.open)));
const late = computed(() => state.value.kind === 'timed_out');
const answeredCount = computed(() => questions.value.filter((question, index) => draftAnswered(question, drafts.value[index] ?? emptyDraft())).length);

// What the card shows once the form is closed: the recorded answers, or those just sent.
const shownAnswers = computed<AnswerRecord[] | null>(() => {
  const current = state.value;
  if (current.kind === 'answered' || current.kind === 'late') return current.answers;
  return Array.isArray(sent.value) ? sent.value : null;
});
const status = computed(() => {
  const current = state.value;
  if (sent.value && (current.kind === 'open' || current.kind === 'timed_out')) return { tone: 'done', text: tr('正在送达…', 'Sending…') };
  switch (current.kind) {
    case 'open': return { tone: 'open', text: tr('等待你回答', 'Waiting for you') };
    case 'answered': return { tone: 'done', text: tr('已回答', 'Answered') };
    case 'late': return { tone: 'done', text: tr('超时后已补答', 'Answered after the timeout') };
    case 'skipped': return { tone: 'muted', text: tr('已跳过', 'Skipped') };
    case 'timed_out': return { tone: current.open ? 'warn' : 'muted', text: current.open ? tr('已超时 · 仍可回答', 'Timed out · still open') : tr('已超时', 'Timed out') };
    default: return { tone: 'muted', text: tr('已中断', 'Stopped') };
  }
});

// How long the call keeps waiting, when the model set a timeout.
const now = ref(Date.now());
const clock = setInterval(() => { now.value = Date.now(); }, 15_000);
onUnmounted(() => clearInterval(clock));
const deadline = computed(() => {
  const form = pending.value.find(item => item.call_id === props.item.callId);
  if (state.value.kind !== 'open' || !form?.timeout_seconds) return null;
  const left = Math.max(0, form.asked_at + form.timeout_seconds * 1000 - now.value) / 1000;
  const format = new Intl.RelativeTimeFormat(i18n.locale.value === 'zh' ? 'zh-CN' : 'en', { numeric: 'always' });
  const when = left < 90 ? format.format(Math.max(1, Math.round(left)), 'second')
    : left < 5400 ? format.format(Math.round(left / 60), 'minute') : format.format(Math.round(left / 3600), 'hour');
  return tr(`模型会在${when}不再等待，先按自己的判断继续`, `The model stops waiting ${when} and carries on`);
});

function choose(index: number, label: string) {
  if (!answerable.value) return;
  drafts.value[index] = pick(questions.value[index]!, drafts.value[index] ?? emptyDraft(), label);
}
function writeOther(index: number, value: string) {
  const draft = drafts.value[index] ?? emptyDraft();
  // A single choice takes either an option or an answer of one's own.
  drafts.value[index] = { ...draft, other: value, selected: questions.value[index]!.multi_select || !value ? draft.selected : [] };
}
function writeText(index: number, value: string) {
  drafts.value[index] = { ...(drafts.value[index] ?? emptyDraft()), text: value };
}

const card = ref<HTMLElement | null>(null);
function focusQuestion(index: number) {
  const block = card.value?.querySelectorAll<HTMLElement>('.question-block')[index];
  (block?.querySelector<HTMLElement>('input, textarea, button.question-option') ?? block)?.focus();
}
// Digits pick options while the focus is on a question (not in a field); Enter in a single-line
// field moves on, and submits from the last one; Ctrl/⌘+Enter submits from anywhere.
function onKey(event: KeyboardEvent, index: number) {
  if (!answerable.value || event.isComposing) return;
  const field = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit(); return; }
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    if (index < questions.value.length - 1) focusQuestion(index + 1);
    else void submit();
    return;
  }
  const option = questions.value[index]?.options?.[Number(event.key) - 1];
  if (!field && /^[1-9]$/.test(event.key) && option && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    choose(index, option.label);
  }
}

async function submit(skip = false) {
  if (!props.session || !answerable.value || sending.value || (!skip && !answeredCount.value)) return;
  const answers = draftAnswers(questions.value, drafts.value);
  sending.value = true;
  try {
    const { delivered } = await api.answerQuestion(props.session, skip ? { call_id: props.item.callId, skip: true } : { call_id: props.item.callId, answers });
    stored.delete(key);
    // A dropped form just closes; the others wait for the history to show what was sent.
    if (delivered !== 'dropped') sent.value = skip ? 'skipped' : questions.value.map((question, index) => ({ question: question.question, type: question.type, ...answers[index] }) as AnswerRecord);
    if (delivered === 'later') toast(tr('回答已作为一条消息发给模型。', 'Your answers went to the model as a message.'));
  } catch (error) {
    showError({ title: skip ? tr('无法跳过提问', 'Could not skip the questions') : tr('无法提交回答', 'Could not send the answers'), error });
  } finally {
    sending.value = false;
  }
}
// The history caught up: what it records replaces what was just sent.
watch(() => state.value.kind, kind => { if (kind !== 'open' && kind !== 'timed_out') sent.value = null; });

const answerText = (answer: AnswerRecord | undefined) => {
  if (!answer || answer.skipped) return null;
  if (answer.type === 'text') return answer.text ?? '';
  return [...(answer.selected ?? []), ...(answer.other ? [answer.other] : [])].join(i18n.locale.value === 'zh' ? '、' : ', ');
};
</script>

<script lang="ts">
const stored = new Map<string, Draft[]>();
</script>

<template>
  <div ref="card" class="question-card" :class="[`is-${state.kind}`, { answerable }]">
    <header class="question-head">
      <Icon name="message-circle-question" />
      <span class="question-title">{{ questions.length > 1 ? tr(`向你提了 ${questions.length} 个问题`, `${questions.length} questions for you`) : tr('向你提问', 'A question for you') }}</span>
      <span class="question-status" :class="status.tone">{{ status.text }}</span>
    </header>

    <p v-if="late && answerable" class="question-note"><Icon name="clock" />{{ tr('模型没等到回答，已经按自己的判断继续了。现在回答，会作为一条新消息发给它。', 'The model stopped waiting and carried on with its own judgement. Answers you give now reach it as a new message.') }}</p>
    <p v-else-if="deadline && answerable" class="question-note"><Icon name="clock" />{{ deadline }}</p>

    <template v-if="answerable">
      <div v-for="(question, index) in questions" :key="index" class="question-block" tabindex="-1" @keydown="onKey($event, index)">
        <div class="question-label">
          <span v-if="question.header" class="question-header">{{ question.header }}</span>
          <span v-if="question.multi_select" class="question-hint">{{ tr('可多选', 'Pick any') }}</span>
        </div>
        <Markdown class="question-text" :text="question.question" />
        <div v-if="question.type === 'choice'" class="question-options" :role="question.multi_select ? 'group' : 'radiogroup'">
          <button v-for="(option, at) in question.options" :key="option.label" type="button" class="question-option"
            :class="{ picked: drafts[index]?.selected.includes(option.label) }"
            :role="question.multi_select ? 'checkbox' : 'radio'" :aria-checked="drafts[index]?.selected.includes(option.label)"
            @click="choose(index, option.label)">
            <span class="option-mark" :class="question.multi_select ? 'box' : 'dot'" aria-hidden="true"><Icon v-if="question.multi_select && drafts[index]?.selected.includes(option.label)" name="check" /></span>
            <span class="option-body"><span class="option-label">{{ option.label }}</span><span v-if="option.description" class="option-description">{{ option.description }}</span></span>
            <kbd v-if="at < 9" class="option-key" aria-hidden="true">{{ at + 1 }}</kbd>
          </button>
          <input v-if="question.allow_other" class="input question-other" :value="drafts[index]?.other"
            :placeholder="tr('或者写下你自己的回答', 'Or write your own answer')" :aria-label="tr('其他回答', 'Your own answer')"
            @input="writeOther(index, ($event.target as HTMLInputElement).value)" />
        </div>
        <textarea v-else-if="question.multiline" class="input question-field" rows="4" :value="drafts[index]?.text" :placeholder="question.placeholder ?? tr('写下你的回答', 'Write your answer')"
          :aria-label="question.question" @input="writeText(index, ($event.target as HTMLTextAreaElement).value)" />
        <input v-else class="input question-field" :value="drafts[index]?.text" :placeholder="question.placeholder ?? tr('写下你的回答', 'Write your answer')"
          :aria-label="question.question" @input="writeText(index, ($event.target as HTMLInputElement).value)" />
      </div>
      <footer class="question-foot">
        <span class="question-progress">{{ tr(`已回答 ${answeredCount}/${questions.length}`, `${answeredCount} of ${questions.length} answered`) }}</span>
        <button type="button" class="btn ghost" :disabled="sending" @click="submit(true)">{{ late ? tr('不再回答', 'Leave it') : tr('跳过', 'Skip') }}</button>
        <button type="button" class="btn primary" :disabled="sending || !answeredCount" :title="tr('Ctrl+Enter 提交', 'Ctrl+Enter to send')" @click="submit()">
          <Icon :name="sending ? 'loader-circle' : 'send'" :class="{ spin: sending }" />{{ late ? tr('补充回答', 'Answer now') : tr('提交', 'Send') }}
        </button>
      </footer>
    </template>

    <dl v-else class="question-summary" :class="{ compact: !shownAnswers }">
      <template v-for="(question, index) in questions" :key="index">
        <dt><span v-if="question.header" class="question-header">{{ question.header }}</span><Markdown class="question-text" :text="question.question" /></dt>
        <dd v-if="shownAnswers" :class="{ empty: answerText(shownAnswers[index]) == null }">{{ answerText(shownAnswers[index]) ?? tr('未回答', 'Not answered') }}</dd>
      </template>
    </dl>
  </div>
</template>

<style>
.question-card { margin: 0 0 20px; padding: 14px 16px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-raised); font-size: 14px; }
.question-card.answerable { border-color: var(--line-strong); }
.question-head { display: flex; align-items: center; gap: 8px; color: var(--fg-muted); font-size: 13px; }
.question-head > .icon { flex: none; width: 16px; height: 16px; color: var(--accent); }
.question-title { flex: 1; min-width: 0; font-weight: 600; color: var(--fg); }
.question-status { flex: none; padding: 1px 8px; border-radius: 999px; font-size: 12px; line-height: 20px; background: var(--bg-sunken); color: var(--fg-subtle); }
.question-status.open { background: var(--accent-soft); color: var(--accent); }
.question-status.warn { background: var(--warn-bg); color: var(--warn); }
.question-status.done { color: var(--ok); }
.question-note { display: flex; align-items: flex-start; gap: 6px; margin: 10px 0 0; font-size: 12px; line-height: 1.6; color: var(--fg-subtle); }
.question-note .icon { flex: none; width: 13px; height: 13px; margin-top: 3px; }
.question-card.is-timed_out .question-note { color: var(--warn); }

.question-block { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); outline: none; }
.question-block:first-of-type { border-top: 0; padding-top: 0; }
.question-label { display: flex; align-items: center; gap: 8px; }
.question-label:empty { display: none; }
.question-header { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--fg-subtle); }
.question-hint { font-size: 11px; color: var(--fg-faint); }
.question-text { margin: 4px 0 10px; font-size: 15px; line-height: 1.7; color: var(--fg); }
.question-text > :last-child { margin-bottom: 0; }
.question-text > :first-child { margin-top: 0; }
.question-options { display: grid; gap: 6px; }
.question-option { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); color: var(--fg); font: inherit; text-align: left; cursor: pointer; transition: border-color var(--dur-fast), background var(--dur-fast); }
@media (hover: hover) { .question-option:hover { border-color: var(--line-strong); background: var(--bg-hover); } }
.question-option.picked { border-color: var(--accent); background: var(--accent-soft); }
.option-mark { flex: none; display: grid; place-items: center; width: 16px; height: 16px; border: 1.5px solid var(--line-strong); background: var(--bg-raised); color: var(--accent-fg); }
.option-mark.dot { border-radius: 50%; }
.option-mark.box { border-radius: 4px; }
.option-mark .icon { width: 12px; height: 12px; }
.question-option.picked .option-mark.box { border-color: var(--accent); background: var(--accent); }
.question-option.picked .option-mark.dot { border: 5px solid var(--accent); }
.option-body { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
.option-label { line-height: 1.5; }
.option-description { font-size: 12px; line-height: 1.5; color: var(--fg-subtle); }
.option-key { flex: none; min-width: 20px; padding: 0 5px; border: 1px solid var(--line); border-radius: 4px; font: 11px/18px var(--mono); color: var(--fg-faint); text-align: center; }
.question-other, .question-field { width: 100%; }
textarea.question-field { resize: vertical; min-height: 88px; line-height: 1.6; }

.question-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.question-progress { margin-right: auto; font-size: 12px; color: var(--fg-subtle); font-variant-numeric: tabular-nums; }
.question-foot .btn { display: inline-flex; align-items: center; gap: 6px; }
.question-foot .icon { width: 15px; height: 15px; }

.question-summary { display: grid; gap: 4px; margin: 10px 0 0; }
.question-summary dt { margin-top: 8px; }
.question-summary dt:first-child { margin-top: 0; }
.question-summary .question-text { margin: 0; font-size: 13px; color: var(--fg-muted); }
.question-summary dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.question-summary dd.empty { color: var(--fg-faint); font-style: italic; }
.question-card:not(.answerable) .question-summary dt .question-text { font-size: 14px; }
.question-summary dd { font-weight: 500; }
.question-summary dd.empty { font-weight: 400; }
/* Nothing was answered: the questions alone, as a short list. */
.question-summary.compact dt { margin-top: 2px; }
.question-summary.compact .question-header { display: none; }
.question-summary.compact .question-text { color: var(--fg-subtle); }

@media (max-width: 599px) {
  .question-card { padding: 12px 12px 14px; }
  .option-key { display: none; }
  .question-foot .btn { flex: 1; justify-content: center; }
  .question-progress { flex-basis: 100%; }
}
</style>
