import test from 'node:test';
import assert from 'node:assert/strict';
import { createSync } from '../src/core/state/syncSlice.ts';
import type { SseOptions } from '../src/core/api/sse.ts';
import type { SessionView } from '../src/core/api/projections.ts';

test('stop closes the stream, cancels pending reads and ignores stale callbacks after restarting', async () => {
  const connections: SseOptions[] = [];
  const events: string[] = [];
  let closed = 0;
  let signal!: AbortSignal;
  let resolve!: (session: SessionView) => void;
  const sync = createSync({
    connect(options) {
      connections.push(options);
      return {
        close() {
          closed++;
        },
      };
    },
    url: (path) => 'https://fixture.test' + path,
    readSession: (_id, cancellation) => {
      signal = cancellation;
      return new Promise((done) => {
        resolve = done;
      });
    },
    emit: (topic: string, ..._payload: unknown[]) => {
      events.push(topic);
    },
  });
  const frame = (connection: SseOptions, value: unknown) =>
    connection.onFrame!({ data: JSON.stringify(value), event: '', id: '', retry: 0 });
  sync.start();
  sync.start();
  assert.equal(connections.length, 1);
  frame(connections[0]!, { type: 'session_changed', id: 'old' });
  sync.stop();
  assert.equal(closed, 1);
  assert.equal(signal.aborted, true);
  assert.equal(sync.online.value, false);
  sync.start();
  frame(connections[0]!, { type: 'snapshot' });
  resolve({ id: 'old' } as SessionView);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, []);
  frame(connections[1]!, { type: 'snapshot' });
  assert.deepEqual(events, ['sync.snapshot']);
  assert.equal(sync.snapshotRevision.value, 1);
  sync.stop();
});
