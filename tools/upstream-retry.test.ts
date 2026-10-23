import test from 'node:test';
import assert from 'node:assert/strict';
import { readUpstreamRetry, retrySecondsLeft } from '../src/core/upstreamRetry.ts';
import { createEmptyStream, createStreamProcessor } from '../src/core/state/chatStream.ts';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse, compileScript } from 'vue/compiler-sfc';
import ts from 'typescript';
import { i18n } from '../src/core/i18n/index.ts';

const status = (request_id = 'model-1', changes: object = {}) => ({
  request_id, operation: 'model', phase: 'waiting', retry: 2, max_retries: 5,
  delay_ms: 11_000, observed_at: 100_000, retry_at: 111_000,
  error: { Transport: { message: 'await headers: connection reset', retryable: true } }, ...changes,
});
function processor() {
  return createStreamProcessor({ onClose() {}, onHistoryPruned() {}, onScheduleRefresh() {},
    onTurnComplete() {}, onNotice() {}, onError(error) { throw error; } });
}

test('retry countdown uses the server remaining time, independently of local clock skew', () => {
  const retry = readUpstreamRetry(status(), 104_000, 1_000)!;
  assert.equal(retry.retryAt, 8_000);
  assert.equal(retrySecondsLeft(retry, 1_000), 7);
  assert.equal(retrySecondsLeft(retry, 7_001), 1);
  assert.equal(retrySecondsLeft(retry, 9_000), 0);
  assert.deepEqual(retry.failure, { message: 'await headers: connection reset', family: 'Transport' });
  assert.equal(readUpstreamRetry(status('', { retry: 0 })), null);
  assert.equal(readUpstreamRetry(status('bad', { retry: 6 })), null);
});

test('live retries report waiting/attempting and clear only their own request on success or cancel', () => {
  const p = processor();
  const frame = (retry: unknown) => JSON.stringify({ type: 'upstream_retry', retry });
  let state = p.processFrame(frame(status()), createEmptyStream());
  assert.equal(state.retries['model-1']?.phase, 'waiting');
  assert.equal(state.retries['model-1']?.retry, 2);
  assert.equal(state.error, null, 'a scheduled retry is not a terminal run failure');
  state = p.processFrame(frame(status('search-2', { operation: 'web_search', retry: 1, max_retries: 3 })), state);
  state = p.processFrame(frame(status('model-1', { phase: 'attempting' })), state);
  assert.equal(state.retries['model-1']?.phase, 'attempting');
  state = p.processFrame(frame(status('model-1', { phase: 'finished' })), state);
  assert.deepEqual(Object.keys(state.retries), ['search-2']);
  state = p.processFrame(frame(status('search-2', { phase: 'finished' })), state);
  assert.deepEqual(state.retries, {});
});

test('a reconnect snapshot restores all current retries and removes obsolete ones', t => {
  t.mock.method(Date, 'now', () => 5_000);
  const p = processor();
  let state = p.processFrame(JSON.stringify({ type: 'upstream_retry', retry: status('old') }), createEmptyStream());
  state = p.processFrame(JSON.stringify({ type: 'snapshot', data: { status: { running: true } },
    live_events: [{ TurnStarted: { turn: 1 } }], retries: [status('new')], server_time: 106_000 }), state);
  assert.deepEqual(Object.keys(state.retries), ['new']);
  assert.equal(state.retries.new?.retryAt, 10_000, 'only five seconds remain after reconnect');
  assert.equal(state.active, true);
});

test('a new turn preserves a concurrent summary retry, and final outcome clears the run', () => {
  const p = processor();
  let state = p.processFrame(JSON.stringify({ type: 'upstream_retry', retry: status('summary', { operation: 'compaction' }) }), createEmptyStream());
  state = p.processFrame(JSON.stringify({ type: 'session_event', event: { TurnStarted: { turn: 2 } } }), state);
  assert.ok(state.retries.summary);
  state = p.processFrame(JSON.stringify({ type: 'operation_finished', outcome: { Failed: status().error } }), state);
  assert.deepEqual(state.retries, {});
  assert.equal(state.active, false);
  assert.equal(state.error.family, 'Transport');
});

test('older server snapshots without retry fields remain compatible', () => {
  const state = processor().processFrame(JSON.stringify({ type: 'snapshot', data: { status: {} }, live_events: [] }), createEmptyStream());
  assert.deepEqual(state.retries, {});
});

test('the conversation retry card renders the count, countdown, error and in-flight state', async t => {
  t.mock.method(Date, 'now', () => 5_000);
  const file = fileURLToPath(new URL('../src/features/sessions/RetryStatus.vue', import.meta.url));
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
  const script = compileScript(descriptor, { id: 'retry-status-test', inlineTemplate: true, templateOptions: { ssr: true } });
  const js = ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = createRequire(file);
  const exports: { default?: ReturnType<typeof defineComponent> } = {};
  new Function('require', 'exports', js)((path: string) => path.endsWith('/Icon.vue')
    ? { default: defineComponent({ setup: () => () => h('span') }) } : localRequire(path), exports);
  const locale = i18n.locale.value;
  i18n.locale.value = 'zh';
  try {
    const waiting = readUpstreamRetry(status())!;
    const html = await renderToString(createSSRApp(exports.default!, { retries: [waiting] }));
    assert.match(html, /正在重试.*2\/5/);
    assert.match(html, /11 秒后重试/);
    assert.match(html, /await headers: connection reset/);
    const attempting = { ...waiting, phase: 'attempting', operation: 'web_search', retry: 1, maxRetries: 3 };
    const sent = await renderToString(createSSRApp(exports.default!, { retries: [attempting] }));
    assert.match(sent, /网页搜索/);
    assert.match(sent, /1\/3/);
    assert.match(sent, /已重新发起请求/);
    assert.ok(!sent.includes('秒后重试'));
  } finally { i18n.locale.value = locale; }
});
