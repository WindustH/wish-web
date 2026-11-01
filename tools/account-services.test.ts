import test from 'node:test';
import assert from 'node:assert/strict';
import type { SettingsConfig } from '../src/core/configTypes.ts';
import type { ServiceCatalogs } from '../src/features/settings/accountServices.ts';
import { accountServices } from '../src/features/settings/accountServices.ts';

function fixture() {
  const config = {
    accounts: { account: { name: 'Example', preset: 'example', api_key: 'key', credentials: {}, credentials_env: {}, proxy_enabled: true } },
    providers: { example: { preset: 'example', credential_id: 'other', enabled: false } },
    search: { order: ['old'], providers: { old: { preset: 'other', credential_id: 'other' } } },
    fetch: { order: [], providers: {} },
    defaults: { provider: 'example', model: 'keep' },
  } as unknown as SettingsConfig;
  const catalogs = {
    models: { presets: [{ id: 'example', provider: 'Example', protocols: ['openai_chat'], required_credentials: ['api_key'], variants: {
      openai_chat: { preset: 'example', enabled: true, protocol: 'openai_chat', models: {}, credentials: {}, headers: {} },
    } }] },
    search: [{ id: 'search', name: 'Search', key: 'borrowed', borrows_from: ['example'] },
      { id: 'free', name: 'Free', key: 'none' }, { id: 'other', key: 'required' }],
    fetch: [{ id: 'reader', name: 'Reader', key: 'required', account_preset: 'example' }],
    image: [{ id: 'image', name: 'Image', account_presets: ['example'], model: 'image-model' }],
    media: ['video', 'speech', 'transcription'].map(kind => ({ id: kind, name: kind, kind, model: 'model', account_presets: ['example'], defaults: { language: 'en' } })),
  } as unknown as ServiceCatalogs;
  return { config, catalogs };
}

test('account suggestions cover compatible services without mutating configuration', () => {
  const {config, catalogs} = fixture();
  const before = structuredClone(config);
  const choices = accountServices(config, 'account', catalogs);
  assert.deepEqual(choices.map(choice => choice.key), ['providers:example', 'search:search', 'fetch:reader', 'image_generation:image', 'video_generation:video', 'audio_generation:speech', 'audio_transcription:transcription']);
  assert.deepEqual(config, before, 'opening or dismissing the prompt is read-only');
  for (const choice of choices) { choice.add(); choice.add(); }
  assert.equal(Object.keys(config.providers).length, 2, 'existing provider id is not overwritten');
  assert.equal(config.providers.example!.enabled, false);
  assert.deepEqual(config.defaults, before.defaults, 'default model is not changed');
  assert.deepEqual(config.search.order, ['old', 'search']);
  assert.equal(config.search.providers.search!.credential_id, 'account');
  assert.equal(config.image_generation!.providers.image!.model, 'image-model');
  assert.deepEqual(config.audio_generation!.providers.speech!.parameters, { language: 'en' });
  assert.equal(accountServices(config, 'account', catalogs).length, 0, 'already linked presets are skipped');
  assert.deepEqual(catalogs, fixture().catalogs, 'catalog templates are immutable');
});

test('missing credentials, unknown and custom account types do not get speculative services', () => {
  const {config, catalogs} = fixture();
  config.accounts.account!.api_key = '';
  assert.deepEqual(accountServices(config, 'account', catalogs), []);
  config.accounts.account!.api_key_env = 'EXAMPLE_API_KEY';
  assert.equal(accountServices(config, 'account', catalogs).length, 7);
  catalogs.image[0]!.required_credentials = ['access_key_id', 'secret_access_key'];
  assert.ok(!accountServices(config, 'account', catalogs).some(choice => choice.key === 'image_generation:image'));
  config.accounts.account!.preset = 'custom';
  assert.deepEqual(accountServices(config, 'account', catalogs), []);
  assert.deepEqual(accountServices(config, 'missing', catalogs), []);
});
