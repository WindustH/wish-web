<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { absUrl, apiFetch } from '../../core/api/client.ts';
import { prefs } from '../../core/state/prefsSlice.ts';
import Icon from '../../ui/components/Icon.vue';
import Markdown from '../../ui/components/Markdown.vue';
import MessageContext from './entries/MessageContext.vue';
import { readAskResponse } from './readAskResponse.ts';
import { tr } from '../../core/i18n/tr.ts';

const props = defineProps<{ sessionId: string; hidden: boolean; externalInput?: boolean }>();
const emit = defineEmits<{ cleared: [] }>();
type AskTurn = { id: number; question: string; answer: string; error: string; busy: boolean };
const question = ref('');
const turns = ref<AskTurn[]>([]);
const busy = ref(false);
const completed = ref(false);
const log = ref<HTMLElement | null>(null);
let nextId = 0;
let generation = 0;
let controller: AbortController | undefined;
let scrollFrame = 0;
onBeforeUnmount(() => {
  generation++;
  controller?.abort();
  cancelAnimationFrame(scrollFrame);
});

function clearConversation() {
  generation++;
  controller?.abort();
  controller = undefined;
  turns.value = [];
  question.value = '';
  busy.value = false;
  completed.value = false;
  cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  emit('cleared');
}
watch([() => props.hidden, busy, completed], ([hidden, isBusy, isComplete]) => {
  if (hidden && !isBusy && isComplete) clearConversation();
});

function contextHistory() {
  const history = turns.value.filter(turn => !turn.busy && !turn.error && turn.answer.trim())
    .slice(-32).map(turn => ({ question: turn.question, answer: turn.answer }));
  const encoder = new TextEncoder();
  while (history.length && encoder.encode(JSON.stringify(history)).byteLength > 120_000) history.shift();
  return history;
}

function atBottom() {
  const el = log.value;
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}
function followAnswer() {
  if (!atBottom() || scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (log.value) log.value.scrollTop = log.value.scrollHeight;
  });
}

function submitQuestion(value?: string) {
  const text = (value ?? question.value).trim();
  if (!text || busy.value) return false;
  const history = contextHistory();
  const turn = reactive<AskTurn>({ id: ++nextId, question: text, answer: '', error: '', busy: true });
  turns.value.push(turn);
  question.value = '';
  busy.value = true;
  completed.value = false;
  void runQuestion(text, history, turn, generation);
  return true;
}

async function runQuestion(text: string, history: { question: string; answer: string }[], turn: AskTurn, owner: number) {
  await nextTick();
  if (owner !== generation) return;
  if (log.value) log.value.scrollTop = log.value.scrollHeight;
  const current = new AbortController();
  controller = current;
  try {
    const response = await apiFetch(absUrl(`/sessions/${encodeURIComponent(props.sessionId)}/ask`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, stream: true, history }), signal: current.signal,
    });
    await readAskResponse(response, (delta: string) => {
      if (owner !== generation) return;
      followAnswer();
      turn.answer += delta;
    });
    if (owner === generation) completed.value = true;
  } catch (error: any) {
    if (owner === generation) turn.error = current.signal.aborted
      ? tr('已停止回答。', 'Answer stopped.')
      : String(error?.message || error);
  } finally {
    if (owner === generation) {
      turn.busy = false;
      busy.value = false;
      controller = undefined;
      followAnswer();
    }
  }
}

function stopAnswer() { controller?.abort(); }
defineExpose({ submitQuestion, stopAnswer, busy });

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  const plain = !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
  const mod = event.ctrlKey || event.metaKey;
  if ((prefs.sendOnEnter.value && plain) || (!prefs.sendOnEnter.value && mod)) {
    event.preventDefault();
    submitQuestion();
  }
}
</script>

<template>
  <section class="ask-context" :class="{ 'external-input': externalInput }">
    <header class="ask-heading">
      <div><strong>BTW</strong><span>{{tr('临时对话','Temporary chat')}}</span></div>
      <button v-if="turns.length" type="button" class="btn ghost icon-only ask-clear" :aria-label="tr('清除 BTW 上下文','Clear BTW context')" @click="clearConversation"><Icon name="trash-2" /></button>
    </header>
    <div ref="log" class="ask-log chatlog" role="log" :aria-label="tr('BTW 问答','BTW conversation')">
      <div v-for="turn in turns" :key="turn.id" class="ask-turn">
        <MessageContext :text="turn.question" kind="user">
          <div class="entry user"><div class="bubble">{{turn.question}}</div></div>
        </MessageContext>
        <MessageContext :text="turn.answer" kind="assistant">
          <div class="entry assistant">
            <div class="body">
              <Markdown v-if="turn.answer" :text="turn.answer" />
              <span v-else-if="turn.busy" class="ask-thinking"><Icon name="loader-circle" class="spin" />{{tr('正在回答…','Answering…')}}</span>
              <p v-if="turn.error" class="ask-error" role="alert">{{turn.error}}</p>
            </div>
          </div>
        </MessageContext>
      </div>
    </div>
    <form v-if="!externalInput" class="ask-composer" @submit.prevent="submitQuestion()">
      <textarea v-model="question" data-initial-focus rows="2" :aria-label="tr('输入问题','Enter a question')" :placeholder="tr('顺便问一下…','By the way…')" @keydown="onKeydown" />
      <div class="ask-actions">
        <button v-if="busy" type="button" class="send-btn stop" :aria-label="tr('停止回答','Stop answering')" @click="stopAnswer"><Icon name="square" /></button>
        <button v-else type="submit" class="send-btn" :disabled="!question.trim()" :aria-label="tr('发送问题','Send question')"><Icon name="send" /></button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.ask-context{display:flex;flex-direction:column;flex:1;min-height:0}
.ask-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;padding:10px 22px 6px}
.ask-heading>div{display:flex;align-items:baseline;gap:8px;min-width:0}
.ask-heading strong{font-size:14px;line-height:1.5}
.ask-heading span{color:var(--fg-subtle);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ask-clear{width:30px;min-width:30px;height:30px;min-height:30px;padding:0;color:var(--fg-subtle)}
.ask-clear .icon{width:15px;height:15px}
.ask-log{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 22px 16px;background:var(--bg)}
.ask-turn+.ask-turn{margin-top:2px}
.ask-turn .entry{padding-bottom:14px}
.ask-turn .entry.user .bubble{max-width:100%}
.ask-turn .entry.assistant .body{min-width:0}
.ask-thinking{display:inline-flex;align-items:center;gap:8px;color:var(--fg-subtle);font-size:13px}
.ask-thinking .icon{width:14px;height:14px}
.ask-error{margin:8px 0 0;color:var(--err);font-size:13px;line-height:1.6}
.ask-composer{flex:none;display:flex;flex-direction:column;border-top:1px solid var(--line-strong);background:var(--bg-raised);padding:10px 16px 8px}
.ask-composer:focus-within{border-top-color:var(--accent)}
.ask-composer textarea{width:100%;min-height:54px;max-height:120px;resize:none;overflow-y:auto;border:0;outline:0;background:transparent;padding:2px 0 4px;font-size:15px;line-height:1.6}
.ask-actions{display:flex;align-items:center;justify-content:flex-end;min-height:36px}
.send-btn{flex:none;display:grid;place-items:center;width:36px;height:36px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--fg-muted);cursor:pointer;transition:background var(--dur-fast),border-color var(--dur-fast),color var(--dur-fast)}
.send-btn .icon{width:16px;height:16px}
.send-btn:disabled{color:var(--fg-subtle);cursor:default}
.send-btn.stop{color:var(--err)}
@media(hover:hover){.send-btn:hover{background:var(--bg-hover);border-color:var(--line-strong)}}
@media(max-width:899px){.ask-heading{padding:9px 20px 4px}.ask-log{padding:12px 20px 16px}.ask-turn .entry{padding-bottom:12px}}
</style>
