import { shallowRef } from 'vue';
import { bus } from '../bus.js';
import { createSse } from '../api/sse.js';
import { absUrl } from '../api/client.js';
import { sessionGet } from '../api/endpoints.js';
export const sync = (() => {
  const state=shallowRef('closed'),online=shallowRef(true),snapshotRevision=shallowRef(0),protocolError=shallowRef(null);
  let connection;
  async function frame(frame) {
    try {
      const event=JSON.parse(frame.data);
      if(event.type==='snapshot'||event.type==='gap'){snapshotRevision.value++;bus.emit('sync.snapshot',{});}
      if(event.type==='session_deleted')bus.emit('tombstone.session',{id:event.id});
      if(event.type==='session_changed'){
        try{const body=await sessionGet(event.id);bus.emit('upsert.session',{id:event.id,body});}
        catch(error){if(error.status===404)bus.emit('tombstone.session',{id:event.id});else throw error;}
      }
      if(event.type==='configuration_changed')bus.emit('configuration.changed',{});
    }catch(error){protocolError.value=error;}
  }
  return {state,online,snapshotRevision,protocolError,
    start(){if(connection)return;connection=createSse({url:absUrl('/events'),onFrame:frame,onState:({state:s})=>{state.value=s;online.value=s==='open';}});},
    stop(){connection?.close();connection=null;state.value='closed';},
    subscribeSession(id,callback){const offs=[bus.on('upsert.session',e=>{if(e.id===id)callback({kind:'upsert',body:e.body});}),bus.on('tombstone.session',e=>{if(e.id===id)callback({kind:'tombstone'});}),bus.on('sync.snapshot',()=>callback({kind:'snapshot'}))];return()=>offs.forEach(off=>off());}
  };
})();
