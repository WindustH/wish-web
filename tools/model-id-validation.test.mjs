import test from 'node:test';
import assert from 'node:assert/strict';
import { setBaseUrl } from '../src/core/api/client.js';
import { requireAvailableModel } from '../src/core/api/endpoints.js';

test('configured display names are checked against upstream model IDs', async () => {
  setBaseUrl('http://wish-test.invalid/api');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({
      items: [{ id: 'deepseek-v4.1-flash', name: null }], next_cursor: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const provider = {
      id: 'go', model_list: 'openai_models',
      models: { 'DeepSeek V4.1 Flash': {} },
    };
    await assert.rejects(
      requireAvailableModel(provider, 'DeepSeek V4.1 Flash'),
      /exact upstream ID/,
    );
    await requireAvailableModel(provider, 'deepseek-v4.1-flash');
    assert.equal(calls.length, 2);
    provider.models['private-custom-model'] = { custom_model_id: true };
    await requireAvailableModel(provider, 'private-custom-model');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
