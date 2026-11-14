import assert from 'node:assert/strict';
import test from 'node:test';
import { reactive } from 'vue';
import { createEmptyStream, createStreamProcessor } from '../src/core/state/chatStream.ts';

test('streaming tool arguments are preparation until execution actually starts, including reconnect', () => {
  const processor = createStreamProcessor({ onClose() {}, onHistoryPruned() {}, onScheduleRefresh() {}, onTurnComplete() {}, onNotice() {}, onError(e) { throw e; } });
  let state = createEmptyStream();
  const draft = { ModelStream: { ToolUseDelta: { index: 0, name: 'shell', arguments: '{"command":"sleep ' } } };
  const started = { ToolStarted: { call_id: 'call-1', name: 'shell' } };
  const send = (event: object) => { state = processor.processFrame(JSON.stringify({ type: 'session_event', event }), state); };
  send(draft);
  assert.equal(state.activity, 'preparingTool');
  assert.equal(state.currentTool, 'shell');
  send(started);
  assert.equal(state.activity, 'tool');
  state = processor.processFrame(JSON.stringify({ type: 'snapshot', data: { status: { running: true } }, live_events: [draft] }), state);
  assert.equal(state.activity, 'preparingTool');
  send(started);
  assert.equal(state.activity, 'tool');
  send({ TurnStarted: { turn: 2 } });
  assert.equal(state.currentTool, null);
  assert.equal(state.activity, 'working');
});

test('checkpoint rewind removes speculative text, reasoning and tool arguments, including after reconnect', () => {
  const processor = createStreamProcessor({ onClose() {}, onHistoryPruned() {}, onScheduleRefresh() {}, onTurnComplete() {}, onNotice() {}, onError(e) { throw e; } });
  let state = createEmptyStream();
  const send = (event: object) => { state = processor.processFrame(JSON.stringify({ type: 'session_event', event: { ModelStream: event } }), reactive(state)); };
  send({ TextDelta: { index: 0, delta: 'kept ' } });
  send({ ReasoningDelta: { index: 1, delta: 'thinking' } });
  send({ Checkpoint: { revision: 1 } });
  send({ TextDelta: { index: 0, delta: 'discarded' } });
  send({ ReasoningDelta: { index: 1, delta: ' discarded' } });
  send({ ToolUseDelta: { index: 2, name: 'shell', arguments: '{"command":"wrong"}' } });
  send({ Rewind: { revision: 1 } });
  assert.equal(state.text, 'kept ');
  assert.equal(state.reasoning, 'thinking');
  assert.deepEqual(state.toolCalls, {});
  send({ Recovering: { attempt: 1, delay_ms: 1000 } });
  assert.equal(state.recovery?.attempt, 1);
  send({ TextDelta: { index: 0, delta: 'done' } });
  assert.equal(state.text, 'kept done');
  assert.equal(state.recovery, undefined);
  const prefix = [{ ModelStream: { TextDelta: { index: 0, delta: 'saved ' } } }];
  state = processor.processFrame(JSON.stringify({ type: 'snapshot', data: { status: { running: true } },
    stream_checkpoint: { revision: 2, events: prefix }, live_events: [{ ModelStream: { TextDelta: { index: 0, delta: 'saved discarded' } } }],
  }), state);
  assert.equal(state.text, 'saved discarded');
  send({ Rewind: { revision: 2 } });
  assert.equal(state.text, 'saved ');
});
