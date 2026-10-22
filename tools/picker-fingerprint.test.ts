import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickerFingerprint, pickerHeading } from '../src/ui/pickerFingerprint.ts';

test('provider titles appearing after models load keep stable virtual row heights', () => {
  const before = [{ key: 'glm', groupKey: 'zai' }, { key: 'flash', groupKey: 'zai' }, { key: 'deepseek', groupKey: 'deepseek' }];
  const after = [{ ...before[0], group: '智谱' }, { ...before[1], group: '智谱' }, { ...before[2], group: 'DeepSeek' }];
  assert.deepEqual(before.map((item, index) => pickerHeading(item, before[index - 1])), [true, false, true]);
  assert.equal(pickerFingerprint(before), pickerFingerprint(after));
});

test('replacing an interior model also resets cached virtual options', () => {
  const before = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  assert.notEqual(pickerFingerprint(before), pickerFingerprint([{ key: 'a' }, { key: 'other' }, { key: 'c' }]));
});
