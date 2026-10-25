import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupHistory } from '../src/features/groups/groupHistory.ts';
import type { GroupMessage, GroupView } from '../src/core/api/types.ts';
const message = (seq: number): GroupMessage => ({seq, at: 0, author: {kind:'user'}, text:String(seq)});
const record = (id: string) => ({id, members:[]} as unknown as GroupView);

test('group changes abort reads and ignore late results', async () => {
  let resolve!: (value: GroupView) => void;
  let oldSignal: AbortSignal | undefined;
  const history = createGroupHistory({groupGet: (id, opts) => id === 'a' ? (oldSignal=opts?.signal, new Promise(r=>resolve=r)) : Promise.resolve(record(id)), groupMessages: async () => ({items:[message(1)],next:null})});
  const first = history.open('a'); await history.open('b');
  assert.equal(oldSignal?.aborted,true); resolve(record('a')); await first;
  assert.equal(history.group.value?.id,'b'); history.stop();
});
test('local posts do not skip intervening peer messages; concurrent catchup is single flight', async () => {
  let calls=0;
  const history=createGroupHistory({groupGet:async id=>record(id),groupMessages:async()=>({items:++calls===1?[message(1)]:[message(3),message(2),message(1)],next:null})});
  await history.open('a'); history.append([message(3)]);
  const first=history.catchUp(), second=history.catchUp(); assert.equal(first,second);
  await first; assert.deepEqual(history.messages.value.map(m=>m.seq),[1,2,3]); assert.equal(calls,2);
});
test('older paging deduplicates overlaps and stops a nonadvancing cursor',async()=>{
  let calls=0;
  const history=createGroupHistory({groupGet:async id=>record(id),groupMessages:async()=>++calls===1?{items:[message(3),message(2)],next:2}:{items:[message(2),message(1)],next:2}});
  await history.open('a'); await Promise.all([history.readOlder(),history.readOlder()]);
  assert.deepEqual(history.messages.value.map(m=>m.seq),[1,2,3]);assert.equal(history.older.value,null);assert.equal(calls,2);
});
test('catchup rejects a stuck cursor and releases its lock for retry',async()=>{
  let calls=0;
  const history=createGroupHistory({groupGet:async id=>record(id),groupMessages:async()=>++calls===1?{items:[message(1)],next:null}:{items:[message(4)],next:4}});
  await history.open('a'); await assert.rejects(history.catchUp(),/did not advance/);
  await assert.rejects(history.catchUp(),/did not advance/);assert.equal(calls,5);
});
test('catchup crosses multiple pages and commits all missing sequences',async()=>{
  let initial=true;
  const history=createGroupHistory({groupGet:async id=>record(id),groupMessages:async(_,params)=>{
    if(initial){initial=false;return {items:[message(2),message(1)],next:null};}
    return params?.before===4?{items:[message(3),message(2)],next:2}:{items:[message(5),message(4)],next:4};
  }});
  await history.open('a');await history.catchUp();
  assert.deepEqual(history.messages.value.map(m=>m.seq),[1,2,3,4,5]);
});
test('aborted older-page completion cannot unlock or modify the new group',async()=>{
  let resolve!: (page: {items:GroupMessage[];next:number|null})=>void;
  const history=createGroupHistory({groupGet:async id=>record(id),groupMessages:async(id,params)=>params?.before?new Promise(r=>resolve=r):{items:[message(id==='a'?20:100)],next:10}});
  await history.open('a');const older=history.readOlder();await history.open('b');
  resolve({items:[message(5)],next:null});await older;
  assert.deepEqual(history.messages.value.map(m=>m.seq),[100]);assert.equal(history.older.value,10);
});
