import test from 'node:test';
import assert from 'node:assert/strict';
import { zh } from '../src/core/i18n/zh.ts';
import { en } from '../src/core/i18n/en.ts';

test('language dictionaries expose identical keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  const parameters = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
  for (const key of Object.keys(en) as (keyof typeof en)[])
    assert.deepEqual(parameters(zh[key]), parameters(en[key]), key);
});
