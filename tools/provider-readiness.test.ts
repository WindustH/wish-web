import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasReadyProvider, providerReady } from '../src/core/providerReadiness.ts';
const provider = { enabled: true, base_url: 'https://example.com', path: '/v1/chat/completions', auth: 'bearer', api_key: '<redacted>', models: { 'test-model': {} } };
test('missing, disabled and incomplete providers require setup', () => {
  assert.equal(hasReadyProvider({ providers: {} }), false);
  for (const patch of [{ enabled: false }, { api_key: '' }, { base_url: '' }, { path: '' }, { models: {} }]) {
    assert.equal(hasReadyProvider({ providers: { a: { ...provider, ...patch } } }), false);
  }
});
test('one ready provider is enough, including environment and unauthenticated providers', () => {
  assert.equal(hasReadyProvider({ providers: { a: { ...provider, enabled: false }, b: provider } }), true);
  assert.equal(providerReady({ ...provider, api_key: null, api_key_env: 'KEY' }), true);
  assert.equal(providerReady({ ...provider, auth: 'none', api_key: null }), true);
});
test('default model and upstream model catalog are supported without local model overrides', () => {
  assert.equal(hasReadyProvider({ providers: { a: { ...provider, models: {} } }, defaults: { provider: 'a', model: 'remote-model' } }), true);
  assert.equal(providerReady({ ...provider, models: {}, model_list: 'openai_models', model_list_path: '/v1/models' }), true);
  assert.equal(providerReady({ ...provider, models: {}, model_list: 'openai_models' }), false);
});
test('SigV4 requires all signing credentials', () => {
  const aws = { ...provider, auth: 'sig_v4', credentials: { region: 'test', access_key_id: '<redacted>' }, credentials_env: { secret_access_key: 'SECRET' } };
  assert.equal(providerReady(aws), true);
  assert.equal(providerReady({ ...aws, credentials_env: {} }), false);
});
