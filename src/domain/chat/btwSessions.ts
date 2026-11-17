import { reactive } from 'vue';
import { absUrl, apiFetch } from '../../core/api/client.ts';
import { uploadSessionBlob } from '../../core/api/endpoints.ts';
import { bus } from '../../core/bus.ts';
import { describeError } from '../../core/i18n/errorMessages.ts';
import { tr } from '../../core/i18n/tr.ts';
import { readAskResponse } from './readAskResponse.ts';
import { streamingText } from '../../ui/streamingText.ts';
export interface BtwTurn {
  id: string;
  question: string;
  answer: string;
  error: string;
  busy: boolean;
  saving: boolean;
  saved: boolean;
  saveError: string;
  created: string;
}
export interface BtwSession {
  turns: BtwTurn[];
  busy: boolean;
}
// UI lifetime is independent of requests: dismissing or navigating away does not abort a response.
const sessions = new Map<string, BtwSession>();
const controllers = new Map<string, AbortController>();
export function btwSession(id: string): BtwSession {
  let state = sessions.get(id);
  if (!state) {
    state = reactive({ turns: [], busy: false });
    sessions.set(id, state);
  }
  // Saved answers live in the library. Keep only a small number of inactive windows in memory.
  for (const [key, candidate] of sessions) {
    if (sessions.size <= 16) break;
    if (key !== id && !candidate.busy && candidate.turns.every((t) => t.saved)) sessions.delete(key);
  }
  return state;
}
export function stopBtw(id: string) {
  controllers.get(id)?.abort();
}
export function clearBtw(id: string) {
  const state = btwSession(id);
  if (!state.busy && !state.turns.some((t) => t.saving)) state.turns = [];
}
export async function saveBtw(id: string, turn: BtwTurn) {
  if (turn.saving || turn.saved || turn.busy || turn.error || !turn.answer.trim()) return;
  turn.saving = true;
  turn.saveError = '';
  try {
    const markdown = `# BTW\n\n${turn.created}\n\n## ${tr('问题', 'Question')}\n\n${turn.question}\n\n## ${tr('回答', 'Answer')}\n\n${turn.answer}\n`;
    await uploadSessionBlob(id, new Blob([markdown], { type: 'text/markdown' }), {
      query: { name: `BTW-${turn.created.replace(/[:.]/g, '-')}.md` },
    });
    turn.saved = true;
    bus.emit('library.files.changed', { session: id });
  } catch (error) {
    turn.saveError = describeError(error).message;
  } finally {
    turn.saving = false;
  }
}
export function askBtw(id: string, question: string): boolean {
  const state = btwSession(id);
  question = question.trim();
  if (!question || state.busy) return false;
  const history = state.turns
    .filter((t) => !t.busy && !t.error && t.answer.trim())
    .slice(-32)
    .map((t) => ({ question: t.question, answer: t.answer }));
  const encoder = new TextEncoder();
  while (history.length && encoder.encode(JSON.stringify(history)).length > 120_000) history.shift();
  const turn = reactive<BtwTurn>({
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    question,
    answer: '',
    error: '',
    busy: true,
    saving: false,
    saved: false,
    saveError: '',
  });
  // Bound retained results while keeping any answer whose save needs retrying.
  const retained = new Set(
    state.turns
      .filter((t) => t.saved)
      .slice(-7)
      .map((t) => t.id),
  );
  state.turns = state.turns.filter((t) => !t.saved || retained.has(t.id));
  state.turns.push(turn);
  state.busy = true;
  const controller = new AbortController();
  controllers.set(id, controller);
  void (async () => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 600_000);
    let answer = '';
    const display = streamingText((value) => {
      turn.answer = value;
    });
    try {
      const response = await apiFetch(absUrl(`/sessions/${encodeURIComponent(id)}/ask`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: question, stream: true, history }),
        signal: controller.signal,
      });
      await readAskResponse(response, (delta) => {
        answer += delta;
        display.write(answer);
      });
    } catch (error) {
      turn.error = timedOut
        ? tr('回答超时', 'Answer timed out')
        : controller.signal.aborted
          ? tr('已停止回答', 'Answer stopped')
          : describeError(error).message;
    } finally {
      display.flush();
      clearTimeout(timeout);
      controllers.delete(id);
      turn.busy = false;
      state.busy = false;
      await saveBtw(id, turn);
    }
  })();
  return true;
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const controller of controllers.values()) controller.abort();
  });
