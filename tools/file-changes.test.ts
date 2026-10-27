import test from 'node:test';
import assert from 'node:assert/strict';
import { changedFiles, rowFileChanges, stackedFiles, fileCardsHeight } from '../src/features/sessions/fileChanges.ts';
import { groupEntries, inlineChips } from '../src/features/chat/grouping.ts';
import { estimateRow } from '../src/features/sessions/rowEstimate.ts';
const result = (seq: number, edits: any[], tool_name = 'shell') => ({ kind: 'tool_result', seq, payload: { tool_name, metadata: { edits } } });
const chip = (edits: any[], name = 'shell') => ({ type: 'process', key: 'p', steps: [{ kind: 'entry', entry: result(1, edits, name) }] });
const edits = (n: number) => Array.from({length:n}, (_, i) => ({path:`/file${i}`, changed:true, diff:'@@ -1 +1 @@\n-old\n+new'}));
test('one to three files are individual cards; only four or more stack', () => {
  for (const n of [0,1,2,3,4,20]) {
    const files = changedFiles(chip(edits(n)));
    assert.equal(files.length,n); assert.equal(stackedFiles(files),n>3);
    if(n) assert.deepEqual([files[0]!.added,files[0]!.removed],[1,1]);
  }
});
test('metadata works for shell and legacy edits; unchanged files and other tools do not make cards', () => {
  assert.equal(changedFiles(chip([...edits(1),{path:'/unchanged',changed:false}])).length,1);
  assert.equal(changedFiles(chip(edits(1),'shell_edit')).length,1);
  assert.equal(changedFiles(chip(edits(1),'web_fetch')).length,0);
});
test('repeated edits of one file share a card without losing individual diffs', () => {
  const files = changedFiles(chip([edits(1)[0],edits(1)[0]]));
  assert.equal(files.length,1); assert.equal(files[0]!.edits.length,2); assert.equal(files[0]!.added,2);
});
test('cards survive a pending activity row becoming text, and album grouping', () => {
  const entries: any[] = [result(1,edits(4))];
  const before = inlineChips(groupEntries(entries))[0]!;
  const after = inlineChips(groupEntries([...entries,{kind:'assistant_message',seq:2,payload:{content:[{type:'text',text:'Done'}]}}]))[0]!;
  assert.deepEqual(rowFileChanges(before),rowFileChanges(after));
  assert.deepEqual(rowFileChanges(after),rowFileChanges({type:'image_album',items:[after]}));
  assert.ok(estimateRow(before,390)>=fileCardsHeight(before));
  assert.ok(estimateRow(after,390)>estimateRow(before,390));
});
