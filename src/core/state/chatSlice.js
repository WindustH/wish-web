// Session-owned execution. Live deltas are transient; paged history is authoritative.
import { shallowRef, computed } from 'vue';
import { cfg } from '../config.js';
import { bus } from '../bus.js';
import { platform } from '../../platform/index.js';
import { createSse } from '../api/sse.js';
import { absUrl } from '../api/client.js';
import { uploadAttachments } from '../attachments.js';
import * as api from '../api/endpoints.js';
const emptyStream=()=>({active:false,phase:'idle',activity:'working',text:'',reasoning:'',toolCalls:{},currentTool:null,usage:null,error:null,gap:false,startedAt:0});
export const chat=(()=>{
  const sessionId=shallowRef(null),snapshot=shallowRef(null),entries=shallowRef([]);
  const oldestSeq=shallowRef(null),newestSeq=shallowRef(null),historyVersion=shallowRef(0);
  const hasMoreBefore=shallowRef(false),hasMoreAfter=shallowRef(false),pendingSeq=shallowRef(null);
  const loadingOlder=shallowRef(false),loadingNewer=shallowRef(false),loadingInitial=shallowRef(false),locating=shallowRef(false);
  const error=shallowRef(null),stream=shallowRef(emptyStream()),sending=shallowRef(false),sentRun=shallowRef(null);
  const capabilities=shallowRef(null),deliveries=shallowRef([]);
  const isActive=computed(()=>sessionId.value!==null),phase=computed(()=>snapshot.value?.phase??'idle');
  let epoch=0,historyEpoch=0,deliveriesVersion=0,controller,connection,timer,poll,offSync,refreshing=false;
  const directInputs=new Set();
  let directSending=false;
  let reasoningBlocks=new Map(), turnVersion=0, viewingPast=false;
  const current=e=>e===epoch;
  const options=()=>({signal:controller?.signal});
  function merge(items){
    const all=new Map(entries.value.map(e=>[e.seq,e]));for(const item of items)all.set(item.seq,item);
    entries.value=[...all.values()].sort((a,b)=>a.seq-b.seq);bounds();
  }
  function bounds(){oldestSeq.value=entries.value[0]?.seq??null;newestSeq.value=entries.value.at(-1)?.seq??null;historyVersion.value++;}
  function close(){epoch++;historyEpoch++;directInputs.clear();directSending=false;controller?.abort();connection?.close();offSync?.();clearTimeout(timer);clearInterval(poll);connection=null;sessionId.value=null;refreshing=false;}
  async function open(id){
    if(sessionId.value===id)return;
    close();sessionId.value=id;controller=new AbortController();const own=epoch;
    viewingPast=false;snapshot.value=null;entries.value=[];bounds();hasMoreBefore.value=false;hasMoreAfter.value=false;
    loadingOlder.value=false;loadingNewer.value=false;loadingInitial.value=true;locating.value=false;
    sending.value=false;error.value=null;stream.value=emptyStream();sentRun.value=null;pendingSeq.value=null;deliveries.value=[];
    capabilities.value={status:'ok',data:{input_modalities:null}};
    // Subscribe before the initial snapshot: reconciliation covers any racing commit.
    connection=createSse({url:absUrl(`/sessions/${encodeURIComponent(id)}/events`),onFrame:f=>{if(current(own))handleFrame(f,own);},onState:({state:s,err})=>{
      if(!current(own))return;
      if(s==='denied'||s==='gone')error.value=err;
      if(s==='open')scheduleRefresh();
    }});
    offSync=bus.on('upsert.session',event=>{if(current(own)&&event.id===id)scheduleRefresh();});
    try{
      const [snap,page]=await Promise.all([api.sessionGet(id,options()),api.historyPage(id,{limit:cfg.history.pageSize,order:'desc'},options())]);
      if(!current(own))return;snapshot.value=snap;entries.value=page.items.slice().reverse();bounds();hasMoreBefore.value=page.has_more;
      stream.value={...stream.value,active:snap.running,phase:snap.running?'pending':'idle'};
      await refreshDeliveries();
    }catch(cause){if(current(own))error.value=cause;}
    finally{if(current(own))loadingInitial.value=false;}
    if(!current(own))return;
    poll=setInterval(()=>{if(current(own))void refresh();},cfg.sync.pollFallbackMs);
  }
  async function reload(){const id=sessionId.value;if(id){close();await open(id);}}
  async function loadOlder({beforeMerge}={}){
    if(loadingOlder.value||!hasMoreBefore.value||!sessionId.value)return false;
    const own=epoch,version=historyEpoch,id=sessionId.value;loadingOlder.value=true;
    try{
      const page=await api.historyPage(id,{before:oldestSeq.value,limit:cfg.history.pageSize,order:'desc'},options());
      if(!current(own)||version!==historyEpoch)return false;
      await beforeMerge?.();if(!current(own)||version!==historyEpoch)return false;
      merge(page.items);hasMoreBefore.value=page.has_more;return true;
    }catch(cause){if(current(own))error.value=cause;return false;}
    finally{if(current(own))loadingOlder.value=false;}
  }
  async function fetchNewer({pages=cfg.history.maxDrainPages,beforeMerge}={}){
    if(!sessionId.value||loadingNewer.value||locating.value)return{ok:false,drained:false,added:0};
    const own=epoch,version=historyEpoch,id=sessionId.value;loadingNewer.value=true;let added=0;
    try{
      for(let n=0;n<pages;n++){
        const page=await api.historyPage(id,{after:newestSeq.value??0,limit:cfg.history.pageSize,order:'asc'},options());
        if(!current(own)||version!==historyEpoch)return{ok:false,drained:false,added};
        await beforeMerge?.();if(!current(own)||version!==historyEpoch)return{ok:false,drained:false,added};
        const before=entries.value.length;merge(page.items);added+=entries.value.length-before;
        hasMoreAfter.value=page.has_more;if(!page.has_more)return{ok:true,drained:true,added};
      }
      return{ok:true,drained:false,added};
    }catch(cause){if(current(own))error.value=cause;return{ok:false,drained:false,added};}
    finally{if(current(own))loadingNewer.value=false;}
  }
  async function refresh(){
    if(refreshing||!sessionId.value)return;refreshing=true;const own=epoch,id=sessionId.value;
    try{
      const snap=await api.sessionGet(id,options());if(!current(own))return;snapshot.value=snap;
      const result=viewingPast?{ok:false,drained:false}:await fetchNewer();if(!current(own))return;
      await refreshDeliveries();if(!current(own))return;
      if(!snap.running&&result.ok&&result.drained)stream.value={...emptyStream(),error:stream.value.error};
      else stream.value={...stream.value,active:snap.running||stream.value.active};
      if(result.ok&&!result.drained)scheduleRefresh();
    }catch(cause){if(current(own))error.value=cause;}
    finally{if(current(own))refreshing=false;}
  }
  function scheduleRefresh(){clearTimeout(timer);timer=setTimeout(refresh,cfg.history.reconcileDelayMs);}
  function handleFrame(frame,own){
    try{
      const data=JSON.parse(frame.data);
      if(data.type==='deleted'){close();return;}
      if(data.type==='snapshot'||data.type==='gap'){stream.value={...stream.value,gap:data.type==='gap'};scheduleRefresh();return;}
      if(data.type==='operation_failed'){stream.value={...stream.value,error:data.error};scheduleRefresh();return;}
      if(data.type==='operation_finished'){
        const outcome=data.outcome;
        if(typeof outcome==='object'&&outcome.Failed)stream.value={...stream.value,error:JSON.stringify(outcome.Failed)};
        scheduleRefresh();return;
      }
      if(data.type!=='session_event')return;
      const [kind,event]=Object.entries(data.event)[0];
      if(kind==='TurnStarted'){turnVersion++;reasoningBlocks=new Map();stream.value={...emptyStream(),active:true,phase:'streaming',startedAt:Date.now()};}
      if(kind==='ModelStream'){
        const [type,value]=Object.entries(event)[0];const s=stream.value;
        if(type==='TextDelta')stream.value={...s,active:true,phase:'streaming',activity:'writing',text:s.text+value.delta};
        if(type==='ReasoningDelta'||type==='ReasoningDisplayDelta'){
          const block=reasoningBlocks.get(value.index)??{plain:'',display:''};
          if(type==='ReasoningDelta')block.plain+=value.delta;else block.display+=value.delta;
          reasoningBlocks.set(value.index,block);
          stream.value={...s,active:true,phase:'streaming',activity:'thinking',reasoning:[...reasoningBlocks.values()].map(b=>b.display||b.plain).join('\n')};
        }
        if(type==='ToolUseDelta'){
          const calls={...s.toolCalls};const previous=calls[value.index]??{name:'',args:''};
          calls[value.index]={name:value.name??previous.name,args:previous.args+value.arguments};
          stream.value={...s,activity:'tool',toolCalls:calls,currentTool:calls[value.index].name};
        }
        if(type==='Usage')stream.value={...s,usage:value};
      }
      if(kind==='ToolStarted')stream.value={...stream.value,activity:'tool',currentTool:event.name};
      if(['ResponseAccepted','ResponseInterrupted','ToolFinished','Finished','ContextCompacted'].includes(kind)){
        const turn=turnVersion;
        if(!viewingPast)void fetchNewer().then(result=>{if(current(own)&&turn===turnVersion&&result.ok&&result.drained&&['ResponseAccepted','ResponseInterrupted'].includes(kind))stream.value={...stream.value,text:'',reasoning:'',toolCalls:{}};});scheduleRefresh();
      }
    }catch(cause){error.value=cause;}
  }
  async function locate(id,seq){
    if(sessionId.value!==id)await open(id);const own=epoch,version=++historyEpoch;viewingPast=true;locating.value=true;
    try{
      const [before,after]=await Promise.all([api.historyPage(id,{before:seq,order:'desc',limit:cfg.history.pageSize},options()),api.historyPage(id,{after:seq-1,order:'asc',limit:cfg.history.pageSize},options())]);
      if(!current(own)||version!==historyEpoch)return false;
      entries.value=[...before.items.reverse(),...after.items];bounds();hasMoreBefore.value=before.has_more;hasMoreAfter.value=after.has_more;pendingSeq.value=seq;return entries.value.some(e=>e.seq===seq);
    }catch(cause){if(current(own))error.value=cause;return false;}finally{if(current(own))locating.value=false;}
  }
  async function jumpToLatest(){
    const own=epoch,version=++historyEpoch,id=sessionId.value;if(!id)return false;
    try{const page=await api.historyPage(id,{order:'desc',limit:cfg.history.pageSize},options());if(!current(own)||version!==historyEpoch)return false;
      entries.value=page.items.reverse();bounds();hasMoreBefore.value=page.has_more;hasMoreAfter.value=false;viewingPast=false;pendingSeq.value=null;return true;
    }catch(cause){if(current(own))error.value=cause;return false;}
  }
  async function send(text,attachments=[]){
    const own=epoch,id=sessionId.value;if(!id||sending.value)return null;sending.value=true;
    const direct=!stream.value.active&&snapshot.value?.phase==='idle';
    directSending=direct;if(direct)deliveriesVersion++;
    try{
      const {blocks}=await uploadAttachments(id,attachments,{signal:controller.signal});
      const result=await api.messageSend(id,{content:text,blocks},options());
      if(current(own)){
        deliveriesVersion++;
        if(direct)directInputs.add(result.id);
        if(!direct&&stream.value.active&&!deliveries.value.some(item=>item.id===result.id))deliveries.value=[...deliveries.value,{id:result.id,state:'queued',text,attachments:blocks.map(b=>({kind:b.type,blob_id:`${id}/${b.blob_id}`,filename:b.filename}))}];
        setDraft('');sentRun.value={sessionId:id,deliveryId:result.id};scheduleRefresh();
      }
      return result.id;
    }finally{if(current(own)){sending.value=false;directSending=false;void refreshDeliveries();}}
  }
  async function refreshDeliveries(){const own=epoch,version=++deliveriesVersion,id=sessionId.value;if(!id)return;try{const page=await api.deliveriesList(id,{limit:50},options());if(current(own)&&version===deliveriesVersion&&!directSending)deliveries.value=page.items.filter(item=>!directInputs.has(item.id));}catch(cause){if(current(own))error.value=cause;}}
  async function moveQueued(id,before){
    const own=epoch,session=sessionId.value;if(!session)return;
    try{await api.moveQueuedInput(session,id,before);}finally{if(current(own))await refreshDeliveries();}
  }
  async function cancelQueued(id){await api.cancelQueuedInput(sessionId.value,id);await refreshDeliveries();return true;}
  async function interrupt(){if(sessionId.value){await api.sessionInterrupt(sessionId.value);scheduleRefresh();}}
  function getDraft(id=sessionId.value){return id?platform('storage').get(`draft.${id}`)??'':'';}
  function setDraft(text,id=sessionId.value){if(id)platform('storage').set(`draft.${id}`,text);}
  return {sessionId,snapshot,entries,oldestSeq,newestSeq,historyVersion,hasMoreBefore,hasMoreAfter,pendingSeq,loadingOlder,loadingNewer,loadingInitial,locating,error,stream,sending,sentRun,capabilities,deliveries,isActive,phase,
    open,close,reload,loadOlder,fetchNewer,locate,jumpToLatest,send,refreshDeliveries,cancelQueued,moveQueued,interrupt,getDraft,setDraft,
    cancelLocate(){historyEpoch++;locating.value=false;},clearPendingSeq(){pendingSeq.value=null;},async reloadCapabilities(){capabilities.value={status:'ok',data:await api.sessionCapabilities(sessionId.value)};}};
})();
