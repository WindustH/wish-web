import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cfg } from '../src/core/config.ts';
import { SseInternalError, createFrameSplitter, createSse, type SseStateEvent } from '../src/core/api/sse.ts';
import { shouldSurfaceSseError } from '../src/core/state/chatSlice.ts';

// A stub fetch that answers every connect with the given response; the original goes back after.
// The stub also has to honour the signal the way a real fetch does: aborting must error the body
// stream, which is what wakes the reader after a silent heartbeat.
async function withFetch(stub: (signal?: AbortSignal) => Promise<Response>, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => stub(init?.signal ?? undefined)) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
}

function waitState(sse: { onState: (fn: (event: SseStateEvent) => void) => () => void },
  want: SseStateEvent['state'], timeoutMs = 2000): Promise<SseStateEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${want} state within ${timeoutMs}ms`)), timeoutMs);
    const off = sse.onState((event) => { if (event.state === want) { clearTimeout(timer); off(); resolve(event); } });
  });
}

const encoder = new TextEncoder();

test('a silent stream times out as an internal reason, never as a visible error', async () => {
  const heartbeat = cfg.sse.heartbeatTimeoutMs;
  cfg.sse.heartbeatTimeoutMs = 30;
  try {
    // Headers arrive, keepalive bytes arrive, then nothing: the heartbeat aborts the fetch.
    const stalling = (signal?: AbortSignal) => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': ping\n\n'));
        signal?.addEventListener('abort', () => controller.error(signal.reason));
      },
    });
    await withFetch(async (signal) => new Response(stalling(signal), { status: 200 }), async () => {
      const sse = createSse({ url: 'http://sse.test/events' });
      try {
        const event = await waitState(sse, 'reconnecting');
        assert.ok(event.err instanceof SseInternalError);
        assert.equal(event.err?.internal, true);
        assert.equal(event.err?.message, 'heartbeat timeout');
        assert.equal(shouldSurfaceSseError(event.state, event.err), false);
      } finally { sse.close(); }
    });
  } finally { cfg.sse.heartbeatTimeoutMs = heartbeat; }
});

test('an engine that swaps our abort reason for its own is still internal', async () => {
  const heartbeat = cfg.sse.heartbeatTimeoutMs;
  cfg.sse.heartbeatTimeoutMs = 30;
  try {
    // Safari-style: the pending read errors with a bare AbortError instead of the reason.
    const stalling = (signal?: AbortSignal) => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': ping\n\n'));
        signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
    });
    await withFetch(async (signal) => new Response(stalling(signal), { status: 200 }), async () => {
      const sse = createSse({ url: 'http://sse.test/events' });
      try {
        const event = await waitState(sse, 'reconnecting');
        assert.equal(event.err?.internal, true);
        assert.equal(event.err?.message, 'heartbeat timeout');
        assert.equal(shouldSurfaceSseError(event.state, event.err), false);
      } finally { sse.close(); }
    });
  } finally { cfg.sse.heartbeatTimeoutMs = heartbeat; }
});

test('a stream the server closes reconnects without an error card', async () => {
  const ended = () => new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
  await withFetch(async () => new Response(ended(), { status: 200 }), async () => {
    const sse = createSse({ url: 'http://sse.test/events' });
    try {
      const event = await waitState(sse, 'reconnecting');
      assert.equal(event.err?.internal, true);
      assert.equal(event.err?.message, 'stream ended');
      assert.equal(shouldSurfaceSseError(event.state, event.err), false);
    } finally { sse.close(); }
  });
});

test('an HTTP failure is a real error the page shows', async () => {
  await withFetch(async () => new Response('nope', { status: 500 }), async () => {
    const sse = createSse({ url: 'http://sse.test/events' });
    try {
      const event = await waitState(sse, 'reconnecting');
      assert.equal(event.err?.status, 500);
      assert.equal(event.err?.internal, undefined);
      assert.equal(shouldSurfaceSseError(event.state, event.err), true);
    } finally { sse.close(); }
  });
});

test('a refused stream stays terminal and visible', async () => {
  await withFetch(async () => new Response('', { status: 401 }), async () => {
    const sse = createSse({ url: 'http://sse.test/events' });
    try {
      const event = await waitState(sse, 'denied');
      assert.equal(event.err?.status, 401);
      assert.equal(shouldSurfaceSseError(event.state, event.err), true);
      assert.equal(sse.isTerminal(), true);
    } finally { sse.close(); }
  });
});

test('only real failures surface, state by state', () => {
  assert.equal(shouldSurfaceSseError('connecting'), false);
  assert.equal(shouldSurfaceSseError('open'), false);
  assert.equal(shouldSurfaceSseError('closed'), false);
  assert.equal(shouldSurfaceSseError('reconnecting'), false);
  assert.equal(shouldSurfaceSseError('reconnecting', new SseInternalError('connect timeout')), false);
  assert.equal(shouldSurfaceSseError('reconnecting', new Error('fetch failed')), true);
  assert.equal(shouldSurfaceSseError('reconnecting', Object.assign(new Error('SSE 500'), { status: 500 })), true);
  assert.equal(shouldSurfaceSseError('denied', Object.assign(new Error('SSE 401'), { status: 401 })), true);
  // A vanished session is handled as "missing" by the chat, not as a banner over the log.
  assert.equal(shouldSurfaceSseError('gone', Object.assign(new Error('SSE 404'), { status: 404 })), false);
});

test('a CRLF split across chunks is still one frame boundary', () => {
  const splitter = createFrameSplitter();
  // The CR ends one chunk, its LF opens the next: one line break, not two.
  assert.deepEqual(splitter.push('data: one\r\n\r'), []);
  const frames = splitter.push('\ndata: two\r\n\r\n');
  assert.deepEqual(frames.map(frame => frame.data), ['one', 'two']);
  assert.equal(frames.length, 2, 'no empty frame from the split boundary');
});

test('a lone CR ending a chunk is a line break when the next chunk is not LF', () => {
  const splitter = createFrameSplitter();
  assert.deepEqual(splitter.push('event: delta\rdata: a\r'), []);
  const frames = splitter.push('data: b\n\n');
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.event, 'delta');
  assert.equal(frames[0]!.data, 'a\nb');
});

test('a data line split over three chunks assembles into one frame', () => {
  const splitter = createFrameSplitter();
  assert.deepEqual(splitter.push('data: {"hel'), []);
  assert.deepEqual(splitter.push('lo": [1,'), []);
  const frames = splitter.push('2]}\n\n');
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.data, '{"hello": [1,2]}');
});

test('a keepalive comment is alive but is not a frame', () => {
  const splitter = createFrameSplitter();
  assert.deepEqual(splitter.push(': ping\n\n'), []);
  assert.deepEqual(splitter.push('data: x\n\n').map(frame => frame.data), ['x']);
});
