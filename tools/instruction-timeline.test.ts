import assert from 'node:assert/strict';
import test from 'node:test';
import { instructionSections } from '../src/features/sessions/instructionSections.ts';
import { groupEntries } from '../src/features/sessions/grouping.ts';
const base = 'You are the agent.';
const full = base + '\n\n# MCP servers\nUse mcp.\n\n# Skills\nUse skills.\n\n# Sessions and groups\nUse sessions.';
test('stored instructions become independent timeline nodes without changing their source', () => {
  const entry = { id: 1, seq: 10, kind: 'system_message', payload: {content: [{type:'text',text:full}], instruction_sections: instructionSections(full)} };
  const before = JSON.stringify(entry);
  const items = groupEntries([entry]);
  assert.equal(items.length,4);
  assert.equal(new Set(items.map(item=>item.key)).size,4);
  assert.equal(JSON.stringify(entry), before);
  assert.ok(items.every(item=>item.type==='entry' && item.entry.seq===10));
});
test('legacy supplemental sections are clearly distinguished and never replace historical text', () => {
  const sections = instructionSections(base,full);
  assert.equal(sections[0].content,base);
  assert.equal(sections[0].supplemental,false);
  assert.ok(sections.slice(1).every(section=>section.supplemental));
  assert.ok(instructionSections(full,full).every(section=>!section.supplemental));
});
test('request-time instructions keep their position between user and assistant messages', () => {
  const items=groupEntries([
    {seq:1,kind:'user_message',payload:{content:[{type:'text',text:'go'}]}},
    {seq:2,kind:'system_message',payload:{content:[{type:'text',text:'continue'}]}},
    {seq:3,kind:'assistant_message',payload:{content:[{type:'text',text:'done'}]}},
  ]);
  assert.deepEqual(items.map(item=>item.type==='entry' ? item.entry.seq : null),[1,2,3]);
});
