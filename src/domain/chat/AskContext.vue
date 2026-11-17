<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { prefs } from '../../core/state/prefsSlice.ts';
import Icon from '../../ui/components/Icon.vue';
import Markdown from '../references/ReferenceMarkdown.vue';
import MessageContext from './entries/MessageContext.vue';
import { askBtw, btwSession, stopBtw, saveBtw } from './btwSessions.ts';
import { tr } from '../../core/i18n/tr.ts';
import { isSendKey } from '../../ui/sendKey.ts';
const props = defineProps<{ sessionId: string; hidden?: boolean; externalInput?: boolean }>();
const state = computed(() => btwSession(props.sessionId));
const turns = computed(() => state.value.turns);
const busy = computed(() => state.value.busy);
const question = ref('');
const log = ref<HTMLElement | null>(null);
watch(
  () => turns.value.at(-1)?.answer,
  async () => {
    const el = log.value;
    const follow = el && el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    await nextTick();
    if (follow && log.value === el) el.scrollTop = el.scrollHeight;
  },
);
function submitQuestion(value?: string) {
  const accepted = askBtw(props.sessionId, value ?? question.value);
  if (accepted) question.value = '';
  return accepted;
}
function stopAnswer() {
  stopBtw(props.sessionId);
}
function onKeydown(event: KeyboardEvent) {
  if (!isSendKey(event, prefs.sendOnEnter.value)) return;
  event.preventDefault();
  submitQuestion();
}
defineExpose({ submitQuestion, stopAnswer, busy });
</script>

<template>
  <section class="ask-context" :class="{ 'external-input': externalInput }">
    <div ref="log" class="ask-log chatlog" role="log" :aria-label="tr('BTW 问答', 'BTW conversation')">
      <div v-for="turn in turns" :key="turn.id" class="ask-turn">
        <MessageContext :text="turn.question" kind="user">
          <div class="entry user">
            <div data-selectable-text class="bubble">{{ turn.question }}</div>
          </div>
        </MessageContext>
        <MessageContext :text="turn.answer" kind="assistant">
          <div class="entry assistant">
            <div class="body">
              <Markdown data-selectable-text v-if="turn.answer" :text="turn.answer" :streaming="turn.busy" />
              <span v-else-if="turn.busy" class="ask-thinking"
                ><Icon name="loader-circle" class="spin" />{{ tr('正在回答…', 'Answering…') }}</span
              >
              <p v-if="turn.error" class="ask-error" role="alert">{{ turn.error }}</p>
              <p v-if="turn.saving || turn.saved" class="ask-save" role="status">
                {{ turn.saving ? tr('正在保存到库…', 'Saving to library…') : tr('已保存到库', 'Saved to library') }}
              </p>
              <p v-if="turn.saveError" class="ask-error" role="alert">
                {{ turn.saveError }}
                <button class="btn ghost" @click="saveBtw(sessionId, turn)">{{ tr('重试保存', 'Retry save') }}</button>
              </p>
            </div>
          </div>
        </MessageContext>
      </div>
    </div>
    <form v-if="!externalInput" class="ask-composer" @submit.prevent="submitQuestion()">
      <textarea
        v-model="question"
        data-initial-focus
        rows="2"
        :aria-label="tr('输入问题', 'Enter a question')"
        :placeholder="tr('顺便问一下…', 'By the way…')"
        @keydown="onKeydown"
      />
      <div class="ask-actions">
        <button
          v-if="busy"
          type="button"
          class="send-btn stop"
          :aria-label="tr('停止回答', 'Stop answering')"
          @click="stopAnswer"
        >
          <Icon name="square" />
        </button>
        <button
          v-else
          type="submit"
          class="send-btn"
          :disabled="!question.trim()"
          :aria-label="tr('发送问题', 'Send question')"
        >
          <Icon name="send" />
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.ask-context {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.ask-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 22px 16px;
  background: var(--bg);
}
.ask-turn + .ask-turn {
  margin-top: 2px;
}
.ask-turn .entry {
  padding-bottom: 14px;
}
.ask-turn .entry.user .bubble {
  max-width: 100%;
}
.ask-turn .entry.assistant .body {
  min-width: 0;
}
.ask-thinking {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--fg-subtle);
  font-size: 13px;
}
.ask-thinking .icon {
  width: 14px;
  height: 14px;
}
.ask-save {
  color: var(--fg-subtle);
  font-size: 12px;
}
.ask-error {
  margin: 8px 0 0;
  color: var(--err);
  font-size: 13px;
  line-height: 1.6;
}
.ask-composer {
  flex: none;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line-strong);
  background: var(--bg-raised);
  padding: 10px 16px 8px;
}
.ask-composer:focus-within {
  border-top-color: var(--accent);
}
.ask-composer textarea {
  width: 100%;
  min-height: 54px;
  max-height: 120px;
  resize: none;
  overflow-y: auto;
  border: 0;
  outline: 0;
  background: transparent;
  padding: 2px 0 4px;
  font-size: 15px;
  line-height: 1.6;
}
.ask-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 36px;
}
@media (max-width: 899px) {
  .ask-log {
    padding: 12px 20px 16px;
  }
  .ask-turn .entry {
    padding-bottom: 12px;
  }
}
</style>
