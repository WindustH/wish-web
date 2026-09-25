import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operationFailure, displayFailure } from '../src/core/api/failures.ts';
import { sessionView } from '../src/core/api/projections.ts';
const failed = (error: unknown) => ({type:'operation_finished',outcome:{Failed:error}});
test('snapshot exposes upstream permission error with HTTP status and code', () => {
  const view=sessionView({session:{id:'test'},status:{config:{},last_operation:failed({Upstream:{status:429,code:'1311',message:'模型无权限'}})}});
  assert.equal(view.last_error!.message,'模型无权限');
  assert.equal(view.last_error!.family,'Upstream · HTTP 429 · 1311');
});
test('backend build, transport, protocol and operation errors remain visible', () => {
  for(const family of ['Build','Malformed','Transport']) assert.equal(operationFailure(failed({[family]:'failure'}))!.message,'failure');
  assert.equal(operationFailure(failed({Unsupported:{feature:'image',subject:'model',reason:'not supported'}}))!.message,'not supported');
  assert.equal(operationFailure({type:'operation_failed',error:'storage failed'})!.message,'storage failed');
  assert.equal(operationFailure({outcome:{StreamFailed:{reason:{Failed:{Transport:{message:'connection lost'}}}}}})!.message,'connection lost');
  assert.ok(operationFailure({outcome:{ModelStopped:{stop_reason:'MaxTokens'}}}));
  assert.ok(operationFailure({outcome:'ToolOutcomeUnknown'}));
});
test('success, voluntary interruption and request cancellation are not failures', () => {
  for(const outcome of ['Completed','Interrupted']) assert.equal(operationFailure({outcome}),null);
  assert.equal(displayFailure({name:'AbortError',message:'aborted'}),null);
  assert.equal(operationFailure(null),null);
});
test('HTTP and network request errors retain useful detail', () => {
  assert.deepEqual(displayFailure({status:401,detail:'unauthorized',code:'401'}),{message:'unauthorized',family:'HTTP 401 · 401'});
  assert.equal(displayFailure(new Error('network unavailable'))!.message,'network unavailable');
});
