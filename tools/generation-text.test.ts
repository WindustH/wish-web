import assert from 'node:assert/strict';
import test from 'node:test';
import { generationText } from '../src/features/sessions/generationText.ts';
test('stored text stays literal, including Markdown and newlines', () => {
  assert.equal(generationText({System:{content:[{Text:{text:'# heading\n**literal**'}}]}}),'# heading\n**literal**');
});
test('reasoning retains plaintext alongside display and opaque replay data', () => {
  const text=generationText({Reasoning:{plaintext:'actual',display:'summary',signature:'sig',ciphertext:'cipher',replay_item:{type:'thought'}}});
  for (const field of ['actual','summary','sig','cipher','thought']) assert.ok(text.includes(field));
});
test('tool results preserve JSON arrays instead of treating them as message blocks', () => {
  const result=[{data:'a'},'b'];
  assert.ok(generationText({ToolResult:{name:'tool',call_id:'call',content:result}}).endsWith(JSON.stringify(result,null,2)));
});
