import { test } from 'node:test';
import assert from 'node:assert/strict';
import { i18n } from '../src/core/i18n/index.ts';
import { providerTitles } from '../src/ui/providerPresentation.ts';

test('instances of one vendor keep their IDs apart', () => {
  i18n.setLocale('en');
  const titles = providerTitles([
    { id: 'deepseek', preset: 'deepseek' },
    { id: 'deepseek-work', preset: 'deepseek' },
    { id: 'openai_codex', preset: 'openai_codex' },
  ]);
  assert.equal(titles.get('deepseek'), 'DeepSeek · deepseek');
  assert.equal(titles.get('deepseek-work'), 'DeepSeek · deepseek-work');
  assert.equal(titles.get('openai_codex'), 'OpenAI');
  i18n.setLocale('zh');
});

test('names nobody else uses stay as they are', () => {
  const titles = providerTitles([
    { id: 'deepseek', preset: 'deepseek', display_name: 'Personal' },
    { id: 'deepseek-work', preset: 'deepseek' },
    { id: 'local', display_name: null },
  ]);
  assert.equal(titles.get('deepseek'), 'Personal');
  assert.equal(titles.get('deepseek-work'), 'DeepSeek');
  assert.equal(titles.get('local'), 'local');
});

test('a display name given twice is told apart too', () => {
  const titles = providerTitles([{ id: 'a', display_name: 'Work' }, { id: 'b', display_name: 'work' }]);
  assert.deepEqual([titles.get('a'), titles.get('b')], ['Work · a', 'work · b']);
});
