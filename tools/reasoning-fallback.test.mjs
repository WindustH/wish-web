import test from 'node:test';
import assert from 'node:assert/strict';
import { setBaseUrl } from '../src/core/api/client.js';
import { sessionUpdateModel } from '../src/core/api/endpoints.js';

// A session snapshot with `old-model` selected at effort `high`.
function snapshot(provider) {
  return {
    session: { id: 's1', name: '', provider, revision: 7, created_at: 0, updated_at: 0 },
    status: { config: { model: 'old-model', reasoning: { effort: 'high' } }, metadata: {}, phase: 'Idle', running: false, queue_count: 0 },
  };
}

// Routes one sessionUpdateModel call and captures the PATCHed config. The session belongs to
// provider `go`; `provider` is the provider description `GET /api/providers` returns.
async function patch(provider, body) {
  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    let value;
    if (path === '/api/sessions/s1' && options.method === 'PATCH') {
      captured = JSON.parse(options.body);
      value = { ...snapshot('go'), status: { ...snapshot('go').status, config: captured.config }, session: { ...snapshot('go').session, revision: 8 } };
    } else if (path === '/api/sessions/s1') {
      value = snapshot('go');
    } else if (path === '/api/providers') {
      value = { items: [provider] };
    } else if (path === '/api/providers/go/models') {
      value = { items: [{ id: 'catalog-model', name: 'Catalog Model' }], next_cursor: null };
    } else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    return { captured: () => captured, result: await sessionUpdateModel('s1', body, 7) };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('switching to a catalog model without levels defaults the effort to max', async () => {
  setBaseUrl('http://wish-test.invalid/api');
  const provider = { id: 'go', models: {}, reasoning_efforts: null, model_list: 'openai_models' };
  const { captured, result } = await patch(provider, { model: 'catalog-model' });
  assert.equal(captured().config.reasoning.effort, 'max');
  assert.equal(result.reasoning_effort, 'max');
});

test('switching without an explicit effort keeps null for a model with known levels', async () => {
  setBaseUrl('http://wish-test.invalid/api');
  const provider = { id: 'go', models: { 'known-model': {} }, reasoning_efforts: { low: 'low', high: 'high', max: 'max' } };
  const { captured } = await patch(provider, { model: 'known-model' });
  assert.equal(captured().config.reasoning, null);
});

test('an explicit effort still wins over the fallback', async () => {
  setBaseUrl('http://wish-test.invalid/api');
  const provider = { id: 'go', models: {}, reasoning_efforts: null, model_list: 'openai_models' };
  const { captured } = await patch(provider, { model: 'catalog-model', reasoning_effort: 'low' });
  assert.equal(captured().config.reasoning.effort, 'low');
});
