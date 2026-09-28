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
import { AnimatePresence, ReorderGroup, ReorderItem, useDragControls } from 'motion-v';

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
// The run waits on an ask_user form; what is queued goes in once the form is answered.
const awaitingAnswer=computed(()=>(chat.snapshot.value?.pending_questions??[]).some(form=>!form.timed_out));
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
  arrivalAnimation?.cancel();release();animating.value=true;
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
  if(expanded.value&&list.value&&!moving.value){list.value.scrollTo({top:list.value.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});pendingScroll=false;}
}
watch(()=>props.items.map(item=>item.id),(ids,previous)=>{if(ids.some(id=>!previous?.includes(id))){pendingScroll=true;void scrollLatest();if(!expanded.value)void signalArrival();}},{immediate:true});
watch(expanded,open=>{if(open){pendingScroll=true;void scrollLatest();}});
let pullStart:number|null=null;
function startPull(event:PointerEvent){pullStart=event.clientY;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);}
function pull(event:PointerEvent){if(pullStart!=null&&pullStart-event.clientY>20){pullStart=null;void setExpanded(true);}}
function collapse(){void setExpanded(false);}

// Reordering is Motion's Reorder: it moves the order while a row is dragged, slides the others
// out of the way, scrolls the list at its edges and settles the row into its slot on release.
// A mouse drags a row straight away; a finger holds it a moment first, so a swipe still scrolls.
const list=ref<HTMLElement>();
const order=ref<string[]>([]);
const moving=ref<string|null>(null);
const busy=ref(false);
const ordered=computed(()=>order.value.map(id=>shown.value.find(item=>item.id===id)).filter(Boolean));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const controls=new Map<string,ReturnType<typeof useDragControls>>();
const controlsOf=(id:string)=>controls.get(id)??controls.set(id,useDragControls()).get(id)!;
let before:string[]=[];
let pressed:{x:number;y:number}|undefined;
let holdTimer:ReturnType<typeof setTimeout>|undefined;
watch(shown, items=>{
  const ids=items.map(item=>item.id);
  for(const id of controls.keys())if(!ids.includes(id))controls.delete(id);
  order.value=moving.value||busy.value ? [...order.value.filter(id=>ids.includes(id)),...ids.filter(id=>!order.value.includes(id))] : ids;
},{immediate:true});
function press(event:PointerEvent,item:any){
  if((event.target as HTMLElement).closest('button')||busy.value||event.button!==0||shown.value.length<2)return;
  if(event.pointerType!=='touch'){controlsOf(item.id).start(event);return;}
  release();
  pressed={x:event.clientX,y:event.clientY};
  holdTimer=setTimeout(()=>{if(pressed)controlsOf(item.id).start(event);},220);
}
function release(){clearTimeout(holdTimer);pressed=undefined;}
function slide(event:PointerEvent){if(pressed&&Math.hypot(event.clientX-pressed.x,event.clientY-pressed.y)>6)release();}
// Once a finger has picked a row up, the list must not scroll under it.
function holdStill(event:TouchEvent){if(moving.value)event.preventDefault();}
onUnmounted(release);
function dragStart(id:string){release();before=[...order.value];moving.value=id;}
async function dragEnd(id:string){
  moving.value=null;
  if(before.join(',')!==order.value.join(','))await saveOrder(id);
  if(pendingScroll)void scrollLatest();
}
async function saveOrder(id:string){
  busy.value=true;
  try{await chat.moveQueued(id,order.value[order.value.indexOf(id)+1]??null);}
  catch(e:any){toast(tx('队列已变化，排序未保存。','Queue changed; order was not saved.')+' '+String(e?.detail||e?.message||e));}
  finally{busy.value=false;order.value=shown.value.map(item=>item.id);}
}
async function keyboardMove(event:KeyboardEvent,item:any){
  if(event.target!==event.currentTarget||!['ArrowUp','ArrowDown'].includes(event.key)||busy.value||moving.value)return;
  event.preventDefault();const index=order.value.indexOf(item.id),next=index+(event.key==='ArrowUp'?-1:1);
  if(next<0||next>=order.value.length)return;
  const ids=[...order.value];ids.splice(index,1);ids.splice(next,0,item.id);order.value=ids;await saveOrder(item.id);
}
async function remove(item: any) {
  if(busy.value||moving.value)return;busy.value=true;
  try { await chat.cancelQueued(item.id); }
  catch (e: any) { toast(String(e?.detail || e?.message || e)); }
  finally{busy.value=false;}
}
async function edit(item: any) {
  if(busy.value||moving.value)return;busy.value=true;
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
    <header class="queue-heading"><span>{{tx('待发送','Queued')}} <small>{{shown.length}}</small></span><span v-if="awaitingAnswer" class="queue-note">{{tx('回答上面的问题后送达','Goes in once the questions above are answered')}}</span><button class="btn ghost icon-only queue-collapse" :aria-label="tx('收起队列','Collapse queue')" :aria-expanded="true" :disabled="animating" @click.stop="collapse"><Icon name="chevron-down"/></button></header>
    <div ref="list" class="queue-scroll" @pointermove="slide" @pointerup="release" @pointercancel="release" @touchmove="holdStill">
    <ReorderGroup v-model:values="order" as="div" axis="y" class="queue-list" role="list">
    <AnimatePresence :initial="false" mode="popLayout">
    <ReorderItem v-for="(item,index) in ordered" :key="item.id" :value="item.id" as="div" class="queue-item" :class="{dragging:moving===item.id}" role="listitem" tabindex="0"
      :drag-listener="false" :drag-controls="controlsOf(item.id)" :initial="reduced?false:{opacity:0,y:8}" :animate="{opacity:1,y:0}" :exit="reduced?undefined:{opacity:0,x:16}"
      @pointerdown="press($event,item)" @keydown="keyboardMove($event,item)" @drag-start="dragStart(item.id)" @drag-end="dragEnd(item.id)">

      <span class="queue-position">{{index+1}}</span>
      <span v-if="hasImages(item)" class="queue-images" role="img" :aria-label="i18n.t('chat.hasImages')"><Icon name="image"/></span>
      <span class="queue-text" :data-hint="item.text">{{item.text||i18n.t('chat.queueUntitled')}}</span>
      <Hint v-if="refillable(item)" :text="i18n.t('chat.queueEdit')"><button class="btn ghost icon-only" :disabled="busy||!!moving" :aria-label="i18n.t('chat.queueEdit')" @click="edit(item)"><Icon name="pencil"/></button></Hint>
      <Hint :text="i18n.t('chat.queueRemove')"><button class="btn ghost icon-only" :disabled="busy||!!moving" :aria-label="i18n.t('chat.queueRemove')" @click="remove(item)"><Icon name="x"/></button></Hint>
    </ReorderItem>
    </AnimatePresence>
    </ReorderGroup>
    </div>
    </div>
  </section>
</template>
