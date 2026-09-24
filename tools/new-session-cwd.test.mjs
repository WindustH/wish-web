import test from 'node:test';
import assert from 'node:assert/strict';
import { setBaseUrl } from '../src/core/api/client.js';
import { sessionCreate } from '../src/core/api/endpoints.js';

test('new session sends its chosen working directory instead of the global default', async () => {
  setBaseUrl('http://wish-test.invalid/api');
  const originalFetch = globalThis.fetch;
  let created;
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    let value;
    if (path === '/api/defaults') value = { defaults: { cwd: '/global', instructions: '', shell: true }, session_config: {} };
    else if (path === '/api/providers') value = { items: [{ id: 'go', models: { model: {} } }] };
    else if (path === '/api/sessions' && options.method === 'POST') {
      created = JSON.parse(options.body);
      value = { session: { id: 'session-1', provider: 'go' }, status: { config: created.config, metadata: {}, phase: 'Idle', running: false, queue_count: 0 } };
    } else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const session = await sessionCreate({ provider: 'go', model: 'model', cwd: '/chosen' });
    assert.equal(session.id, 'session-1');
    assert.equal(created.cwd, '/chosen');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
