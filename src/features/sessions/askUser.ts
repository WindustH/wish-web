import { tr } from '../../core/i18n/tr.ts';
// `ask_user` forms in the conversation: the call's arguments read the way the server reads
// them, what became of a form, and a draft turned into the answers the server takes.
import type { AskQuestion, PendingQuestion } from '../../core/api/projections.ts';
import type { QuestionAnswer } from '../../core/api/endpoints.ts';

/** One answer as the server records it, beside the question it answers. */
export interface AnswerRecord {
  question: string;
  type: 'choice' | 'text';
  selected?: string[];
  other?: string;
  text?: string;
  skipped?: boolean;
}

/**
 * - `open`: the call waits for the answers.
 * - `timed_out`: the call went on without them; `open` while the form still takes a late answer.
 * - `late`: answered after the timeout, as a message of its own.
 * - `cancelled`: the run stopped before an answer.
 */
export type FormState =
  | { kind: 'open' }
  | { kind: 'answered' | 'late'; answers: AnswerRecord[] }
  | { kind: 'skipped' | 'cancelled' }
  | { kind: 'timed_out'; open: boolean };

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

/** The questions of a call, with the server's defaults filled in; empty when unreadable. */
export function readForm(args: unknown): AskQuestion[] {
  let value = args;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  const questions = (value as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(questions)) return [];
  return questions.map((raw): AskQuestion => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const choice = item.type === 'choice';
    const options = choice && Array.isArray(item.options)
      ? item.options.map(option => typeof option === 'string'
        ? { label: option }
        : { label: String((option as { label?: unknown })?.label ?? ''), description: text((option as { description?: unknown })?.description) })
      : undefined;
    return {
      type: choice ? 'choice' : 'text',
      question: String(item.question ?? ''),
      header: text(item.header),
      options,
      multi_select: choice && item.multi_select === true,
      allow_other: choice && item.allow_other !== false,
      placeholder: choice ? undefined : text(item.placeholder),
      multiline: !choice && item.multiline === true,
    };
  });
}

interface Payload { result?: { status?: string; output?: { status?: string; answers?: AnswerRecord[] } }; metadata?: { answers?: AnswerRecord[] } }
export interface QuestionSource { callId: string; result: { payload?: unknown } | null; late: { payload?: unknown } | null }

export function formState(item: QuestionSource, pending: readonly PendingQuestion[], running: boolean): FormState {
  const late = item.late?.payload as Payload | undefined;
  if (late) return { kind: 'late', answers: late.metadata?.answers ?? [] };
  const open = pending.find(form => form.call_id === item.callId);
  const result = (item.result?.payload as Payload | undefined)?.result;
  // No result yet: the call is still waiting, unless the run ended without closing it.
  if (!result) return (open && !open.timed_out) || running ? { kind: 'open' } : { kind: 'cancelled' };
  const output = result.status === 'success' ? result.output : undefined;
  switch (output?.status) {
    case 'answered': return { kind: 'answered', answers: output.answers ?? [] };
    case 'skipped': return { kind: 'skipped' };
    case 'timed_out': return { kind: 'timed_out', open: !!open?.timed_out };
    default: return { kind: 'cancelled' };
  }
}

/** What the user has put in so far, one entry per question. */
export interface Draft { selected: string[]; other: string; text: string }
export const emptyDraft = (): Draft => ({ selected: [], other: '', text: '' });

export const draftAnswered = (question: AskQuestion, draft: Draft) =>
  question.type === 'choice' ? draft.selected.length > 0 || !!draft.other.trim() : !!draft.text.trim();

/** The answers to send; a question left blank is skipped. */
export function draftAnswers(questions: readonly AskQuestion[], drafts: readonly Draft[]): QuestionAnswer[] {
  return questions.map((question, index) => {
    const draft = drafts[index] ?? emptyDraft();
    if (!draftAnswered(question, draft)) return { skipped: true };
    if (question.type === 'text') return { text: draft.text.trim() };
    const other = draft.other.trim();
    return other ? { selected: draft.selected, other } : { selected: draft.selected };
  });
}

/** Picks an option: a single choice replaces the pick, a multiple one toggles it. */
export function pick(question: AskQuestion, draft: Draft, label: string): Draft {
  if (!question.multi_select) return { ...draft, selected: draft.selected[0] === label ? [] : [label], other: '' };
  const selected = draft.selected.includes(label) ? draft.selected.filter(item => item !== label) : [...draft.selected, label];
  return { ...draft, selected };
}

/** An answer as the page shows it: the text given, or the choices; null when it was skipped. */
export function answerText(answer: AnswerRecord | undefined): string | null {
  if (!answer || answer.skipped) return null;
  if (answer.type === 'text') return answer.text ?? '';
  return [...(answer.selected ?? []), ...(answer.other ? [answer.other] : [])].join(tr('、', ', '));
}
