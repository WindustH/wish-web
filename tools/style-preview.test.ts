import test from 'node:test';
import assert from 'node:assert/strict';
import { stylePreviewFixtures } from '../src/features/settings/stylePreviewFixtures.ts';
import { changedFiles } from '../src/features/sessions/fileChanges.ts';
import { formState } from '../src/features/sessions/askUser.ts';
test('style gallery covers files, messages, tools and session/group operations', () => {
  const samples = stylePreviewFixtures();
  assert.equal(new Set(samples.map(sample => sample.id)).size, samples.length);
  assert.deepEqual(new Set(samples.map(sample => sample.category)), new Set(['files','messages','tools','sessions']));
  assert.deepEqual(samples.filter(sample => sample.kind === 'files').map(sample => changedFiles(sample.item).length), [1,3,6]);
  for (const name of ['session-create','session-send','session-denied','group-received','group-sent','group-long']) {
    assert.ok(samples.some(sample => sample.id === name));
  }
  assert.equal(formState(samples.find(sample => sample.id === 'question')!.item, [], false).kind, 'answered');
});
