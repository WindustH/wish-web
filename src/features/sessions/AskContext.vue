<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { absUrl } from '../../core/api/client.js';
import { tr } from '../settings/fields';
const props = defineProps<{ sessionId: string }>();
const question = ref(''), answer = ref(''), error = ref(''), busy = ref(false);
let controller: AbortController | undefined;
onBeforeUnmount(() => controller?.abort());
async function ask() {
  if (!question.value.trim() || busy.value) return;
  const current = new AbortController(); controller = current;
  answer.value = ''; error.value = ''; busy.value = true;
  try {
    const response = await fetch(absUrl(`/sessions/${encodeURIComponent(props.sessionId)}/ask`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: question.value, stream: true }), signal: current.signal,
    });
    if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message || response.statusText); }
    const reader = response.body!.getReader(), decoder = new TextDecoder(); let buffer = '', finished = false;
    try {
      while (!finished) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const lines = frame.split('\n'), event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
          const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          if (event === 'done') { finished = true; break; }
          const parsed = JSON.parse(data);
          if (event === 'error') throw new Error(parsed.message);
          if (parsed.TextDelta) answer.value += parsed.TextDelta.delta;
          if (parsed.Stop === 'MaxOutputLengthExceeded') error.value = tr('回答达到输出上限。','The answer reached the output limit.');
        }
      }
      if (!finished) throw new Error(tr('响应连接提前结束，已收到的内容保留如下。','The response connection ended early; received content is retained below.'));
    } finally { await reader.cancel(); }
  } catch (e: any) { if (!current.signal.aborted) error.value = String(e.message || e); }
  finally { busy.value = false; controller = undefined; }
}
</script>
<template>
  <section class="ask-context">
    <h4>{{tr('无状态问答','Ask about context')}}</h4>
    <p class="hint">{{tr('基于当前上下文回答一次，不调用工具，不写入会话历史。','Answer once using current context, without tools or changes to session history.')}}</p>
    <label>{{tr('问题','Question')}}<textarea class="input" rows="3" v-model="question" :disabled="busy"/></label>
    <div><button v-if="!busy" class="btn" :disabled="!question.trim()" @click="ask">{{tr('提问','Ask')}}</button><button v-else class="btn" @click="controller?.abort()">{{tr('停止回答','Stop answering')}}</button></div>
    <p v-if="error" role="alert" class="load-error">{{error}}</p>
    <div v-if="answer" class="answer" aria-live="polite">{{answer}}</div>
  </section>
</template>
<style scoped>
.ask-context{display:grid;gap:12px}.ask-context h4,.ask-context p{margin:0}.ask-context label{display:grid;gap:6px}.ask-context textarea{width:100%;resize:vertical}.answer{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:var(--surface);border:1px solid var(--line);max-height:50vh;overflow:auto}
</style>
