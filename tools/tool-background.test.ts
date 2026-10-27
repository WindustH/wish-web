import test from 'node:test';
import assert from 'node:assert/strict';
import { entryView } from '../src/core/api/projections.ts';
import { groupEntries } from '../src/features/chat/grouping.ts';
import { formState } from '../src/features/sessions/askUser.ts';
import { awaitsAnswer, waitingForms } from '../src/core/questionWatch.ts';
const project = (id:number, message:any) => entryView({record:{sequence:id,recorded_at:0},content:{kind:'message',value:{id,message}}},'s');
test('background question remains answerable and completion updates its original card', () => {
  const call = project(1,{ToolUse:{call_id:'q',name:'ask_user',arguments:{questions:[{type:'text',question:'Name?'}]}}});
  const result = project(2,{ToolResult:{call_id:'q',name:'ask_user',content:{status:'success',output:{background:true,status:'running'}}}});
  const pending = [{call_id:'q',asked_at:0,timeout_seconds:null,timed_out:false,questions:[]}];
  let card:any = groupEntries([call,result])[0];
  assert.equal(formState(card,pending,false).kind,'open');
  assert.equal(awaitsAnswer({pending_questions:pending,background_tools:[{call_id:'q'}]}),false);
  assert.equal(waitingForms({pending_questions:pending}).length,1);
  const complete = project(3,{User:{metadata:{source:'background_tool_finished',call_id:'q',job_id:'job',tool_name:'ask_user',result:{status:'success',output:{status:'answered',answers:[{text:'Alice'}]}}},content:[{Text:{text:'Background result'}}]}});
  card = groupEntries([call,result,complete])[0];
  assert.equal(formState(card,[],false).kind,'answered');
  assert.equal(complete.kind,'developer_message');
  assert.equal(complete.payload.background,true);
});
test('a failed background tool retains structured failure for timeline rendering',()=>{
  const complete = project(3,{User:{metadata:{source:'background_tool_finished',call_id:'x',tool_name:'web_fetch',result:{status:'unknown',message:'Server restarted'}},content:[{Text:{text:'Unknown result'}}]}});
  assert.equal(complete.payload.result.status,'unknown');
  assert.equal(complete.payload.tool_name,'web_fetch');
});
