import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAskResponse } from '../src/domain/chat/readAskResponse.ts';

function sse(chunks: string[]) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
}

test('BTW displays text as each SSE delta arrives across split CRLF frames', async () => {
  const seen: string[] = [];
  const response = sse([
    'event: model_event\r\ndata: {"TextDelta":{"index":0,"delta":"你"}}\r\n',
    '\r\nevent: model_event\r\ndata: {"TextDelta":{"index":0,"delta":"好"}}\r\n\r\n',
    'event: done\r\ndata: {}\r\n\r\n',
  ]);
  await readAskResponse(response, text => seen.push(text));
  assert.deepEqual(seen, ['你', '好']);
});

test('BTW displays complete JSON replies from non-streaming model protocols', async () => {
  const seen: string[] = [];
  const response = Response.json({ messages: [
    { Reasoning: { display: 'hidden' } },
    { Assistant: { content: [{ Text: { text: '可见回答' } }] } },
  ] });
  await readAskResponse(response, text => seen.push(text));
  assert.deepEqual(seen, ['可见回答']);
});

test('BTW keeps partial text and reports stream errors', async () => {
  const seen: string[] = [];
  const response = sse([
    'event: model_event\ndata: {"TextDelta":{"index":0,"delta":"部分"}}\n\n',
    'event: error\ndata: {"message":"上游断开"}\n\n',
  ]);
  await assert.rejects(readAskResponse(response, text => seen.push(text)), /上游断开/);
  assert.deepEqual(seen, ['部分']);
});

test('BTW rejects malformed JSON with event context', async () => {
  await assert.rejects(readAskResponse(sse(['event: model_event\ndata: {broken}\n\n']), () => {}), /Invalid JSON.*model_event/);
});

test('BTW bounds an unterminated frame and cancels its reader', async () => {
  let cancelled = false;
  const chunk = new TextEncoder().encode('x'.repeat(1024 * 1024));
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(chunk); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(readAskResponse(response, () => {}), /size limit/);
  assert.equal(cancelled, true);
});
