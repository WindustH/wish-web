<script setup lang="ts">
// Queue dock: one row per message waiting for the running loop's next turn
// boundary, rendered as the top of the composer's own surface. The protocol
// has no in-place edit, so edit cancels the queued delivery and hands the
// original text back to the composer (cancel-first is race-free: if the loop
// already consumed it, nothing is refilled); delete is a plain cancel.
// Refill travels as a callback prop, not an emit: the emit happens after an
// await, and by then the row's removal (local or via the delivery SSE) has
// unmounted this dock — Vue drops emits on unmounted instances.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { i18n } from '../../core/i18n/index.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { toast } from '../../ui/toast.ts';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';

const props = defineProps<{ items: any[]; refill: (text: string, attachments?: any[]) => void }>();

// Attachment indicator: queued rows carry per-item references from the
// control-plane projection; the dock only consumes "has an image" (files do
// not count) and renders one image glyph — the composer picker's own icon —
// never a count.
const hasImages = (item: any): boolean => {
  const a = item.attachments;
  return Array.isArray(a) && a.some((x) => x?.kind === 'image');
};
const refillable = (item: any): boolean =>
  Boolean(item.text) || (Array.isArray(item.attachments) && item.attachments.length > 0);

const tx=(zh:string,en:string)=>i18n.locale.value==='zh'?zh:en;
const shown=computed(()=>props.items);
const expanded=ref(true);
const dock=ref<HTMLElement>();
let arrivalAnimation:Animation|undefined;
onUnmounted(()=>arrivalAnimation?.cancel());
async function signalArrival(){
  await nextTick();
  if(expanded.value||!dock.value)return;
  arrivalAnimation?.cancel();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  arrivalAnimation=dock.value.animate([
    {transform:'translateY(0)',backgroundColor:'var(--bg-raised)',color:'var(--fg-muted)'},
    {transform:reduced?'translateY(0)':'translateY(-5px)',backgroundColor:'var(--accent-soft)',color:'var(--accent)',offset:.4},
    {transform:'translateY(0)',backgroundColor:'var(--bg-raised)',color:'var(--fg-muted)'}
  ],{duration:reduced?240:360,easing:'ease-out'});
}
const animating=ref(false);
let dockAnimation:Animation|undefined;
onUnmounted(()=>dockAnimation?.cancel());
async function setExpanded(open:boolean){
  if(animating.value||expanded.value===open)return;
  arrivalAnimation?.cancel();cancelDrag();animating.value=true;
  try{
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(open){expanded.value=true;await nextTick();}
    const el=dock.value;
    if(el&&!reduced){
      const rect=el.getBoundingClientRect();
      const parentLeft=el.offsetParent?.getBoundingClientRect().left??0;
      const shift=parentLeft+parseFloat(getComputedStyle(el).left)-rect.left;
      const full={transform:'scale(1)',opacity:1,borderRadius:'12px'};
      const small={transform:`translateX(${shift}px) scale(${40/rect.width},${40/rect.height})`,opacity:.15,borderRadius:'20px'};
      dockAnimation=el.animate(open?[small,full]:[full,small],{duration:200,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
      try{await dockAnimation.finished;}catch{return;}
    }
    expanded.value=open;await nextTick();
    dockAnimation?.cancel();dockAnimation=undefined;
    if(open)void scrollLatest();
  }finally{animating.value=false;}
}
let pendingScroll=false;
async function scrollLatest(){
  await nextTick();
  if(expanded.value&&list.value&&!drag){list.value.scrollTo({top:list.value.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});pendingScroll=false;}
}
watch(()=>props.items.map(item=>item.id),(ids,previous)=>{if(ids.some(id=>!previous?.includes(id))){pendingScroll=true;void scrollLatest();if(!expanded.value)void signalArrival();}},{immediate:true});
watch(expanded,open=>{if(open){pendingScroll=true;void scrollLatest();}});
let pullStart:number|null=null;
function startPull(event:PointerEvent){pullStart=event.clientY;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);}
function pull(event:PointerEvent){if(pullStart!=null&&pullStart-event.clientY>20){pullStart=null;void setExpanded(true);}}
function collapse(){void setExpanded(false);}

const list=ref<HTMLElement>();
const order=ref<string[]>([]);
const moving=ref<string|null>(null);
const busy=ref(false);
const ordered=computed(()=>order.value.map(id=>shown.value.find(item=>item.id===id)).filter(Boolean));
let drag: {id:string;pointer:number;handle:HTMLElement;centers:number[];scroll:number;y:number;startY:number;started:boolean;touch:boolean;scrolling:boolean;original:string[]}|null=null;
let frame=0;
let holdTimer:ReturnType<typeof setTimeout>|undefined;
watch(shown, items=>{
  const ids=items.map(item=>item.id);
  if(drag&&!ids.includes(drag.id)) stopDrag();
  order.value=drag||busy.value ? [...order.value.filter(id=>ids.includes(id)),...ids.filter(id=>!order.value.includes(id))] : ids;
},{immediate:true});
function stopDrag(){
  cancelAnimationFrame(frame);clearTimeout(holdTimer);
  const current=drag;drag=null;moving.value=null;
  if(current?.handle.hasPointerCapture(current.pointer))current.handle.releasePointerCapture(current.pointer);
  if(pendingScroll)void scrollLatest();
}
onUnmounted(stopDrag);
function updateDrag(){
  if(!drag||!list.value)return;
  if(!drag.started){frame=requestAnimationFrame(updateDrag);return;}
  const bounds=list.value.getBoundingClientRect();
  if(drag.y<bounds.top+28)list.value.scrollTop-=6;
  else if(drag.y>bounds.bottom-28)list.value.scrollTop+=6;
  const y=drag.y+list.value.scrollTop-drag.scroll;
  let index=drag.centers.reduce((best,center,i)=>Math.abs(center-y)<Math.abs(drag!.centers[best]!-y)?i:best,0);
  index=Math.min(index,order.value.length-1);
  if(order.value.indexOf(drag.id)!==index){const next=order.value.filter(id=>id!==drag!.id);next.splice(index,0,drag.id);order.value=next;}
  frame=requestAnimationFrame(updateDrag);
}
function startDrag(event:PointerEvent,item:any){
  if((event.target as HTMLElement).closest('button')||busy.value||event.button!==0||shown.value.length<2||!list.value)return;
  const handle=list.value;
  drag={id:item.id,pointer:event.pointerId,handle,centers:Array.from(list.value.querySelectorAll('.queue-item')).map(el=>{const r=el.getBoundingClientRect();return r.top+r.height/2;}),scroll:list.value.scrollTop,y:event.clientY,startY:event.clientY,started:false,touch:event.pointerType==='touch',scrolling:false,original:[...order.value]};
  handle.setPointerCapture(event.pointerId);event.preventDefault();
  if(drag.touch)holdTimer=setTimeout(()=>{if(drag&&!drag.scrolling){drag.started=true;moving.value=drag.id;}},220);
  frame=requestAnimationFrame(updateDrag);
}
function pointerMove(event:PointerEvent){
  if(!drag||event.pointerId!==drag.pointer)return;
  drag.y=event.clientY;
  if(!drag.started&&Math.abs(drag.y-drag.startY)>6){
    if(drag.touch){clearTimeout(holdTimer);drag.scrolling=true;}
    else{drag.started=true;moving.value=drag.id;}
  }
  if(drag.scrolling&&list.value)list.value.scrollTop=drag.scroll+drag.startY-drag.y;
}
async function finishDrag(event:PointerEvent){
  if(!drag||event.pointerId!==drag.pointer)return;
  const {id,original}=drag;stopDrag();
  if(original.join(',')!==order.value.join(','))await saveOrder(id);
}
function cancelDrag(){stopDrag();order.value=shown.value.map(item=>item.id);}
async function saveOrder(id:string){
  busy.value=true;
  try{await chat.moveQueued(id,order.value[order.value.indexOf(id)+1]??null);}
  catch(e:any){toast(tx('队列已变化，排序未保存。','Queue changed; order was not saved.')+' '+String(e?.detail||e?.message||e));}
  finally{busy.value=false;order.value=shown.value.map(item=>item.id);}
}
async function keyboardMove(event:KeyboardEvent,item:any){
  if(event.target!==event.currentTarget||!['ArrowUp','ArrowDown'].includes(event.key)||busy.value||drag)return;
  event.preventDefault();const index=order.value.indexOf(item.id),next=index+(event.key==='ArrowUp'?-1:1);
  if(next<0||next>=order.value.length)return;
  const ids=[...order.value];ids.splice(index,1);ids.splice(next,0,item.id);order.value=ids;await saveOrder(item.id);
}
async function remove(item: any) {
  if(busy.value||drag)return;busy.value=true;
  try { await chat.cancelQueued(item.id); }
  catch (e: any) { toast(String(e?.detail || e?.message || e)); }
  finally{busy.value=false;}
}
async function edit(item: any) {
  if(busy.value||drag)return;busy.value=true;
  try {
    const cancelled = await chat.cancelQueued(item.id);
    if (cancelled) props.refill(item.text || '', item.attachments);
    else toast(i18n.t('chat.queueConsumed'));
  } catch (e: any) { toast(String(e?.detail || e?.message || e)); }
  finally{busy.value=false;}
}
</script>

<template>
  <section ref="dock" class="queue-dock" :class="{ collapsed: !expanded }" :aria-label="i18n.t('chat.queueTitle')" :aria-busy="busy||animating">
    <button v-if="!expanded" class="queue-expand" :aria-label="tx('展开待发送消息','Expand queued messages')" :aria-expanded="false" :disabled="animating" @click.stop="setExpanded(true)" @pointerdown="startPull" @pointermove="pull" @pointerup="pullStart=null" @pointercancel="pullStart=null"><Icon name="chevron-up"/></button>
    <div v-if="expanded" class="queue-expanded">
    <header class="queue-heading"><span>{{tx('待发送','Queued')}} <small>{{shown.length}}</small></span><button class="btn ghost icon-only queue-collapse" :aria-label="tx('收起队列','Collapse queue')" :aria-expanded="true" :disabled="animating" @click.stop="collapse"><Icon name="chevron-down"/></button></header>
    <div ref="list" class="queue-scroll" @pointermove="pointerMove" @pointerup="finishDrag" @pointercancel="cancelDrag" @lostpointercapture="drag&&cancelDrag()">
    <TransitionGroup name="queue-row" tag="div" class="queue-list" role="list">
    <div v-for="(item,index) in ordered" :key="item.id" class="queue-item" :class="{dragging:moving===item.id}" role="listitem" tabindex="0" @pointerdown="startDrag($event,item)" @keydown="keyboardMove($event,item)">

      <span class="queue-position">{{index+1}}</span>
      <span v-if="hasImages(item)" class="queue-images" role="img" :aria-label="i18n.t('chat.hasImages')"><Icon name="image"/></span>
      <span class="queue-text" :data-hint="item.text">{{item.text||i18n.t('chat.queueUntitled')}}</span>
      <Hint v-if="refillable(item)" :text="i18n.t('chat.queueEdit')"><button class="btn ghost icon-only" :disabled="busy||!!moving" :aria-label="i18n.t('chat.queueEdit')" @click="edit(item)"><Icon name="pencil"/></button></Hint>
      <Hint :text="i18n.t('chat.queueRemove')"><button class="btn ghost icon-only" :disabled="busy||!!moving" :aria-label="i18n.t('chat.queueRemove')" @click="remove(item)"><Icon name="x"/></button></Hint>
    </div>
    </TransitionGroup>
    </div>
    </div>
  </section>
</template>
