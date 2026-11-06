import test from 'node:test';
import assert from 'node:assert/strict';
import { setBaseUrl } from '../src/core/api/client.ts';
import { sessionTasks, taskOutput } from '../src/core/api/endpoints.ts';

test('task viewing uses session-scoped list and nonblocking bounded output reads', async (t) => {
  setBaseUrl('https://wish.test/api');
  const requests: {url: string; body?: any}[] = [];
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    requests.push({url: String(url), body: init?.body ? JSON.parse(init.body) : undefined});
    return Response.json(init?.method === 'POST' ? {text: 'output', output_bytes: 100000, next_offset: 100000} : {tasks: []});
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await sessionTasks('session/id', signal), {tasks: []});
  await taskOutput('session/id', 'task', 0, 0, signal);
  await taskOutput('session/id', 'task', 34464, 65536, signal);
  assert.ok(requests.every(request => request.url === 'https://wish.test/api/sessions/session%2Fid/tasks'));
  assert.equal(requests[1]!.body.operation.max_bytes, 0);
  assert.deepEqual(requests[2]!.body, {action: 'execute', operation: {operation: 'poll', execution_id: 'task', offset: 34464, max_bytes: 65536, wait_ms: 0, encoding: 'utf8'}});
});
