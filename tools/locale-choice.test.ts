import { test } from 'node:test';
import assert from 'node:assert/strict';
import { i18n } from '../src/core/i18n/index.ts';

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, get: (key: string) => values.get(key) ?? null, set: (key: string, value: string) => void values.set(key, value) };
}

test('a first visit follows the system language and remembers nothing', () => {
  const storage = memory();
  i18n.init({ storageAdapter: storage, readSystem: () => ['en-US', 'zh-CN'] });
  assert.equal(i18n.choice.value, 'auto');
  assert.equal(i18n.locale.value, 'en');
  assert.equal(storage.values.size, 0);
  i18n.init({ storageAdapter: memory(), readSystem: () => ['zh-TW'] });
  assert.equal(i18n.locale.value, 'zh');
});

test('a system language Wish lacks falls back to English, an unknown system to the default', () => {
  i18n.init({ storageAdapter: memory(), readSystem: () => ['ja-JP', 'fr'] });
  assert.equal(i18n.locale.value, 'en');
  i18n.init({ storageAdapter: memory(), readSystem: () => [] });
  assert.equal(i18n.locale.value, 'zh');
});

test('a chosen language outlasts the system and a change of it', () => {
  let system = ['en-GB'];
  let changed = () => {};
  const storage = memory({ locale: 'zh' });
  i18n.init({ storageAdapter: storage, readSystem: () => system, watchSystem: cb => { changed = cb; } });
  assert.equal(i18n.locale.value, 'zh');
  system = ['en-US']; changed();
  assert.equal(i18n.locale.value, 'zh');
  i18n.setChoice('auto');
  assert.equal(storage.values.get('locale'), 'auto');
  assert.equal(i18n.locale.value, 'en');
  system = ['zh-CN']; changed();
  assert.equal(i18n.locale.value, 'zh');
});

test('showing a language for a moment does not choose it', () => {
  const storage = memory({ locale: 'en' });
  i18n.init({ storageAdapter: storage, readSystem: () => ['zh-CN'] });
  i18n.setLocale('zh');
  assert.equal(i18n.choice.value, 'en');
  assert.equal(storage.values.get('locale'), 'en');
  i18n.init({ storageAdapter: memory({ locale: 'zh' }), readSystem: () => [] });
});
