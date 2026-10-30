import assert from 'node:assert/strict';
import test from 'node:test';
import { entryView } from '../src/core/api/projections.ts';
import { groupEntries } from '../src/domain/chat/grouping.ts';
import { fileEdits, searchResults, stepFailed } from '../src/features/sessions/entries/processDetails.ts';
const event = (seq:number, value:any) => entryView({record:{sequence:seq,recorded_at:'2026-10-26T00:00:00Z'}, content:{kind:'event',value:{Application:value}}},'session');
for(const name of ['web_fetch','web_search','task','ask_user','session']) {
  test(`${name} command events project as normal tool calls/results`,()=>{
    const call=event(1,{type:'command_tool_use',name,call_id:'call',arguments:{questions:[{type:'text',question:'Name?'}]}});
    const result=event(2,{type:'command_tool_result',name,call_id:'call',content:{status:'success',output:{status:'answered',answers:[]}},metadata:{results:[{url:'https://example.com'}]}});
    assert.equal(call.payload.content[0].type,'tool_call');
    assert.equal(result.payload.tool_call_id,'call');
    const grouped=groupEntries([call,result]);
    assert.ok(grouped.length>0);
    assert.ok(!grouped.some((item:any)=>item.entry?.kind==='history_event'));
    if(name==='web_search')assert.ok(searchResults({kind:'entry',entry:result}));
  });
}
test('shell edits keep full metadata diffs, and failed commands retain structured diagnostics',()=>{
  const step={kind:'entry',entry:{payload:{tool_name:'shell',result:{status:'failed',message:JSON.stringify({process:{exit_code:7},edits:[{path:'/a',changed:true}]})},metadata:{edits:[{path:'/a',diff:'+change'}]}}}};
  assert.equal(fileEdits(step)[0].diff,'+change');
  assert.equal(stepFailed(step),true);
});
