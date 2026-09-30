import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupEntries, type GroupEntry } from '../src/features/sessions/grouping.ts';
import { draftAnswers, emptyDraft, formState, pick, readForm } from '../src/features/sessions/askUser.ts';
import { createQuestionWatch } from '../src/core/questionWatch.ts';

const form = { questions: [
  { type: 'choice', question: 'Which database?', options: ['SQLite', { label: 'PostgreSQL', description: 'a server' }] },
  { type: 'choice', question: 'Which platforms?', options: ['Linux', 'macOS'], multi_select: true, allow_other: false },
  { type: 'text', question: 'Table prefix?', placeholder: 'app_' },
] };
const call = (seq: number, id: string, name = 'ask_user'): GroupEntry =>
  ({ kind: 'assistant_message', seq, payload: { content: [{ type: 'tool_call', id, name, arguments: form }] } });
const result = (seq: number, id: string, value: unknown, name = 'ask_user'): GroupEntry =>
  ({ kind: 'tool_result', seq, payload: { tool_name: name, tool_call_id: id, result: value } as GroupEntry['payload'] });

test('an ask_user call becomes its own card between process groups, holding its result', () => {
  const answered = result(4, 'q', { status: 'success', output: { status: 'answered', answers: [] } });
  const items = groupEntries([call(1, 'a', 'shell_start'), result(2, 'a', { status: 'success' }, 'shell_start'), call(3, 'q'), answered,
    { kind: 'assistant_message', seq: 5, payload: { content: [{ type: 'text', text: 'Done.' }] } }]);
  assert.deepEqual(items.map(item => item.type), ['process', 'question', 'entry']);
  const card = items[1]!;
  assert.ok(card.type === 'question');
  assert.equal(card.callId, 'q');
  assert.equal(card.result, answered);
});

test('a malformed form stays in the process, and a late answer stays where it arrived', () => {
  const failed = groupEntries([call(1, 'q'), result(2, 'q', { status: 'failed', message: 'bad form' })]);
  assert.deepEqual(failed.map(item => item.type), ['process']);
  const late: GroupEntry = { kind: 'developer_message', seq: 9, payload: { metadata: { source: 'ask_user_answer', call_id: 'q' } } as GroupEntry['payload'] };
  const items = groupEntries([call(1, 'q'), result(2, 'q', { status: 'success', output: { status: 'timed_out' } }), late]);
  assert.deepEqual(items.map(item => item.type), ['question', 'entry']);
  assert.ok(items[0]!.type === 'question');
  assert.equal(items[0]!.late, late);
});

test('forms read the way the server reads them', () => {
  const [database, platforms, prefix] = readForm(JSON.stringify(form));
  assert.deepEqual(database!.options, [{ label: 'SQLite' }, { label: 'PostgreSQL', description: 'a server' }]);
  assert.equal(database!.allow_other, true);
  assert.equal(platforms!.multi_select, true);
  assert.equal(platforms!.allow_other, false);
  assert.equal(prefix!.placeholder, 'app_');
  assert.deepEqual(readForm({}), []);
});

test('what became of a form', () => {
  const pending = [{ call_id: 'q', questions: [], asked_at: 0, timeout_seconds: 60, timed_out: false }];
  const item = (payload: unknown, late: unknown = null) => ({ callId: 'q', result: payload ? { payload: { result: payload } } : null, late: late ? { payload: late } : null });
  assert.equal(formState(item(null), pending, true).kind, 'open');
  assert.equal(formState(item(null), [], false).kind, 'cancelled');
  assert.equal(formState(item({ status: 'cancelled' }), [], false).kind, 'cancelled');
  assert.equal(formState(item({ status: 'success', output: { status: 'skipped' } }), [], false).kind, 'skipped');
  assert.deepEqual(formState(item({ status: 'success', output: { status: 'timed_out' } }), [{ ...pending[0]!, timed_out: true }], false), { kind: 'timed_out', open: true });
  assert.deepEqual(formState(item({ status: 'success', output: { status: 'timed_out' } }), [], false), { kind: 'timed_out', open: false });
  const answers = [{ question: 'Which database?', type: 'choice', selected: ['SQLite'] }];
  assert.deepEqual(formState(item({ status: 'success', output: { status: 'timed_out' } }, { metadata: { answers } }), [], false), { kind: 'late', answers });
});

test('drafts become answers; blanks are skipped and a single choice keeps one pick', () => {
  const questions = readForm(form);
  let database = pick(questions[0]!, emptyDraft(), 'SQLite');
  database = pick(questions[0]!, database, 'PostgreSQL');
  assert.deepEqual(database.selected, ['PostgreSQL']);
  let platforms = pick(questions[1]!, emptyDraft(), 'Linux');
  platforms = pick(questions[1]!, platforms, 'macOS');
  assert.deepEqual(platforms.selected, ['Linux', 'macOS']);
  assert.deepEqual(draftAnswers(questions, [{ ...database, other: ' later ' }, platforms, emptyDraft()]),
    [{ selected: ['PostgreSQL'], other: 'later' }, { selected: ['Linux', 'macOS'] }, { skipped: true }]);
});

test('new questions are noticed once, and not on the first sighting', () => {
  const watch = createQuestionWatch();
  const open = (call_id: string, timed_out = false) => ({ call_id, questions: [], asked_at: 0, timeout_seconds: null, timed_out });
  assert.deepEqual(watch.observe({ id: 's', pending_questions: [open('a')] }), []);
  assert.deepEqual(watch.observe({ id: 's', pending_questions: [open('a'), open('b')] }).map(item => item.call_id), ['b']);
  assert.deepEqual(watch.observe({ id: 's', pending_questions: [open('b', true), open('c', true)] }), []);
});
