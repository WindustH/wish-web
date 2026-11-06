import test from 'node:test';
import assert from 'node:assert/strict';
import { createChat, type ChatDependencies } from '../src/core/state/chatSlice.ts';
import type { SseOptions } from '../src/core/api/sse.ts';
import type { SessionView } from '../src/core/api/projections.ts';
const deferred = <T>() => { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; };
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const snap=(id='a',running=false,revision=1)=>({id,running,revision,phase:running?'running':'idle'} as SessionView);
function setup(requests: ChatDependencies['requests']={}) {
  const connections: SseOptions[]=[];
  const chat=createChat({url:path=>'http://fixture'+path,connect:((options:SseOptions)=>{connections.push(options);return {close(){}};}) as any,
    requests:{sessionGet:async id=>snap(id),historyPage:async()=>({items:[],has_more:false,next_cursor:null}),deliveriesList:async()=>({items:[],has_more:false}),...requests}});
  const frame=(data:unknown)=>connections.at(-1)!.onFrame!({data:JSON.stringify(data),id:'',event:'',retry:0});
  return {chat,frame};
}
test('initial failure retries the latest window rather than draining from sequence zero',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const orders:string[]=[];
  const {chat}=setup({historyPage:async(_,params)=>{orders.push(params.order!);if(orders.length===1)throw Error('offline');return {items:[{seq:100,id:100,created_at:0,kind:'user_message',payload:{content:[]}}],has_more:true,next_cursor:100};}});
  try {
    await chat.open('a');assert.equal(chat.loadingInitial.value,false);assert.ok(chat.error.value);
    t.mock.timers.tick(250);await flush();
    assert.deepEqual(orders,['desc','desc']);assert.equal(chat.entries.value[0]?.seq,100);
    assert.equal(chat.hasMoreBefore.value,true);assert.equal(chat.error.value,null);
  }finally{chat.close();}
});
test('queue refresh cannot hold the initial history loading gate',async()=>{
  const queue=deferred<{items:[],has_more:false}>();
  const {chat}=setup({deliveriesList:()=>queue.promise});
  try{await chat.open('a');assert.equal(chat.loadingInitial.value,false);assert.equal(chat.snapshot.value?.id,'a');}
  finally{chat.close();queue.resolve({items:[],has_more:false});}
});
test('an event arriving during initialization wins over the older HTTP run state',async()=>{
  const request=deferred<SessionView>();const {chat,frame}=setup({sessionGet:()=>request.promise});
  try{
    const opening=chat.open('a');frame({type:'snapshot',data:{status:{running:true}},live_events:[]});
    request.resolve(snap('a',false));await opening;assert.equal(chat.stream.value.active,true);
  }finally{chat.close();}
});
test('same-session open waits for initialization; another session ignores the old response',async()=>{
  const request=deferred<SessionView>();const {chat}=setup({sessionGet:async id=>id==='a'?request.promise:snap(id)});
  try{
    const first=chat.open('a');let settled=false;const same=chat.open('a').then(()=>{settled=true;});
    await flush();assert.equal(settled,false);
    await chat.open('b');request.resolve(snap('a'));await Promise.all([first,same]);
    assert.equal(chat.sessionId.value,'b');assert.equal(chat.snapshot.value?.id,'b');assert.equal(chat.loadingInitial.value,false);
  }finally{chat.close();}
});
test('late idle reconciliation cannot erase a newer live run',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const queue=deferred<{items:[],has_more:false}>();let calls=0;
  const {chat,frame}=setup({deliveriesList:async()=>++calls===1?{items:[],has_more:false}:queue.promise});
  try{
    await chat.open('a');t.mock.timers.tick(250);await flush();
    frame({type:'snapshot',data:{status:{running:true}},live_events:[]});
    queue.resolve({items:[],has_more:false});await flush();assert.equal(chat.stream.value.active,true);
  }finally{chat.close();}
});

test('history poll failures share the reconciliation threshold and clear after recovery',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});let broken=false;
  const {chat}=setup({historyPage:async()=>{if(broken)throw Error('history offline');return {items:[],has_more:false,next_cursor:null};}});
  try{
    await chat.open('a');broken=true;
    t.mock.timers.tick(250);await flush();assert.equal(chat.error.value,null);
    for(let i=0;i<2;i++){t.mock.timers.tick(5000);t.mock.timers.tick(250);await flush();}
    assert.match(String(chat.error.value),/history offline/);
    broken=false;t.mock.timers.tick(5000);t.mock.timers.tick(250);await flush();assert.equal(chat.error.value,null);
  }finally{chat.close();}
});

test('search cannot be overwritten by a late initial history window',async()=>{
  const initial=deferred<any>();const queries:any[]=[];
  const entry=(seq:number)=>({seq,id:seq,created_at:0,kind:'user_message' as const,payload:{content:[]}});
  const {chat}=setup({historyPage:async(_,params)=>{queries.push(params);if(queries.length===1)return initial.promise;return {items:[entry(10)],has_more:false,next_cursor:null};}});
  try{
    const opening=chat.open('a');const locating=chat.locate('a',10);await flush();assert.equal(queries.length,1);
    initial.resolve({items:[entry(100)],has_more:true,next_cursor:100});await opening;assert.equal(await locating,true);
    assert.deepEqual(chat.entries.value.map(e=>e.seq),[10]);assert.equal(chat.pendingSeq.value,10);
  }finally{chat.close();}
});

test('retry resumes the session once without sending another user message', async () => {
  const response=deferred<any>();let runs=0,inputs=0;
  const {chat}=setup({sessionRun:async()=>{runs++;return response.promise;},messageSend:async()=>{inputs++;throw Error('unexpected input');}});
  try {
    await chat.open('a');
    const first=chat.retryRun('a');await chat.retryRun('a');
    assert.equal(runs,1);assert.equal(chat.retryingRun.value,true);
    response.resolve({accepted:true});await first;
    assert.equal(inputs,0);assert.equal(chat.retryingRun.value,false);
    await chat.retryRun('other');assert.equal(runs,1);
  } finally {chat.close();}
});

test('new model messages keep appearing after quoting loaded or paged history', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const entry=(seq:number)=>({seq,id:seq,created_at:0,kind:'assistant_message' as const,payload:{content:[{type:'text' as const,text:'answer '+seq}]}});
  for (const target of [100, 10]) {
    let initial = true, latest = 100;
    const {chat} = setup({historyPage: async (_, params) => {
      if (initial) { initial = false; return {items:[entry(100)],has_more:true,next_cursor:100}; }
      if (params.before != null) return {items:[],has_more:false,next_cursor:null};
      if (params.after === 9) return {items:[entry(10)],has_more:true,next_cursor:10};
      return {items:latest > (params.after ?? 0) ? [entry(latest)] : [],has_more:false,next_cursor:null};
    }});
    try {
      await chat.open('a');
      assert.equal(await chat.locate('a',target),true);
      if (target === 10) await chat.fetchNewer();
      chat.clearPendingSeq();
      latest = 101;
      t.mock.timers.tick(5000); t.mock.timers.tick(250); await flush();
      assert.equal(chat.entries.value.at(-1)?.seq,101,'completed reply is reconciled without a reload');
    } finally {chat.close();}
  }
});
