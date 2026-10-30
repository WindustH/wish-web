import assert from 'node:assert/strict';
import test from 'node:test';
import { entryView } from '../src/core/api/projections.ts';
import { createEmptyStream, createStreamProcessor } from '../src/core/state/chatStream.ts';
import { groupEntries } from '../src/features/chat/grouping.ts';
import { chipEvents, resultLookup } from '../src/features/sessions/entries/railMeta.ts';
import { stepText } from '../src/features/sessions/entries/processDetails.ts';
import { generationText } from '../src/features/sessions/generationText.ts';

function stored(reasoning: Record<string, unknown>, seq = 1) {
  return {
    record: { sequence: seq, recorded_at: 0, model_call_id: 1 },
    content: { kind: 'message', value: { id: seq, origin: 'Model', message: { Reasoning: reasoning } } },
  };
}

const cases = [
  { name: 'Gemini generateContent signed summary', value: { plaintext: 'Gemini summary', display: 'Gemini summary', signature: 'opaque-proof', opaque_kind: 'GoogleSignature' }, text: 'Gemini summary', delta: 'ReasoningDelta' },
  { name: 'Gemini Interactions thought summary', value: { plaintext: 'First.\nSecond.', display: 'First.\nSecond.', signature: 'opaque-proof', replay_item: { type: 'thought', summary: [{ type: 'text', text: 'First.' }, { type: 'text', text: 'Second.' }] }, opaque_kind: 'GoogleInteractionsThought' }, text: 'First.\nSecond.', delta: 'ReasoningDelta' },
  { name: 'Claude signed thinking', value: { plaintext: 'Claude thinking', display: 'Claude thinking', signature: 'opaque-proof', opaque_kind: 'AnthropicSignature' }, text: 'Claude thinking', delta: 'ReasoningDelta' },
  { name: 'GPT encrypted reasoning with summary', value: { plaintext: '', display: 'GPT summary', ciphertext: 'opaque-proof', opaque_kind: 'OpenAiEncrypted' }, text: 'GPT summary', delta: 'ReasoningDisplayDelta' },
  { name: 'GPT display takes precedence over plaintext', value: { plaintext: 'Replayable thinking', display: 'Reader summary', ciphertext: 'opaque-proof' }, text: 'Reader summary', delta: 'ReasoningDisplayDelta' },
  { name: 'legacy plaintext without display', value: { plaintext: 'Legacy thinking', signature: 'opaque-proof' }, text: 'Legacy thinking', delta: 'ReasoningDelta' },
  { name: 'empty display falls back to plaintext', value: { plaintext: 'Plain thinking', display: '', signature: 'opaque-proof' }, text: 'Plain thinking', delta: 'ReasoningDelta' },
];

for (const item of cases) {
  test(`${item.name}: live text survives persisted history and timeline details`, () => {
    const processor = createStreamProcessor({ onClose() {}, onHistoryPruned() {}, onScheduleRefresh() {}, onTurnComplete() {}, onNotice() {}, onError(error) { throw error; } });
    const frame = { type: 'session_event', event: { ModelStream: { [item.delta]: { index: 0, delta: item.text } } } };
    const live = processor.processFrame(JSON.stringify(frame), createEmptyStream());
    assert.equal(live.reasoning, item.text);
    const native = stored(item.value);
    const before = JSON.stringify(native);
    const entry = entryView(JSON.parse(before), 'fixture');
    const chip = groupEntries([entry])[0]!;
    assert.equal(chip.type, 'process');
    const events = chipEvents(chip, resultLookup(chip));
    assert.equal(events.length, 1);
    assert.equal(stepText(events[0]!.step), live.reasoning, 'the clicked icon opens the same readable text');
    assert.equal(JSON.stringify(native), before, 'the stored replay data is untouched');
    assert.ok(!JSON.stringify(entry).includes('opaque-proof'), 'proofs never become display text');
  });
}

for (const [name, value] of [
  ['Gemini signature-only part', { plaintext: '', display: '', signature: 'opaque-proof', opaque_kind: 'GoogleSignature' }],
  ['Gemini opaque Interactions thought', { plaintext: '', display: '', replay_item: { type: 'thought', signature: 'opaque-proof' } }],
  ['Claude redacted thinking', { plaintext: '', display: '', ciphertext: 'opaque-proof', opaque_kind: 'AnthropicRedacted' }],
  ['GPT encrypted reasoning without summary', { plaintext: '', display: '', ciphertext: 'opaque-proof', opaque_kind: 'OpenAiEncrypted' }],
] as const) {
  test(`${name}: opaque material keeps its timeline icon without exposing ciphertext`, () => {
    const native = stored(value);
    const before = JSON.stringify(native);
    const entry = entryView(native, 'fixture');
    const chip = groupEntries([entry])[0]!;
    const events = chipEvents(chip, resultLookup(chip));
    assert.equal(events.length, 1);
    assert.equal(events[0]!.icon, 'thinking');
    assert.equal(stepText(events[0]!.step), '');
    assert.equal(JSON.stringify(native), before);
    if ('signature' in value || 'ciphertext' in value || 'replay_item' in value)
      assert.ok(generationText(native.content.value.message).includes('opaque-proof'));
  });
}

test('Gemini summary stays accessible beside a separate signature-only icon', () => {
  const entries = [
    entryView(stored({ plaintext: 'Gemini summary', display: 'Gemini summary' }, 10), 'fixture'),
    entryView(stored({ plaintext: '', display: '', signature: 'opaque-proof' }, 11), 'fixture'),
    { seq: 12, kind: 'assistant_message', payload: { content: [{ type: 'tool_call', id: 'c', name: 'shell', arguments: {} }] } },
    { seq: 13, kind: 'tool_result', payload: { tool_name: 'shell', tool_call_id: 'c', result: { status: 'success' }, content: [] } },
    { seq: 14, kind: 'assistant_message', payload: { content: [{ type: 'text', text: 'Answer' }] } },
  ];
  const chip = groupEntries(entries)[0]!;
  const events = chipEvents(chip, resultLookup(chip));
  assert.equal(events.length, 3, 'summary, signature-only block, and tool all retain their own icon');
  assert.equal(events[0]!.seq, 10);
  assert.equal(events[0]!.key, 's10b0');
  assert.equal(stepText(events[0]!.step), 'Gemini summary');
  assert.equal(stepText(events[1]!.step), '');
  assert.equal(events[2]!.icon, 'terminal');
});
