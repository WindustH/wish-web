<script setup lang="ts">
// Messages waiting for the running loop's next turn boundary. The composer's toolbar shows how many
// wait - a clock and a count - and pressing it opens them in a bubble above, like BTW's. Rows reorder
// by dragging, edit, or go. The protocol has no in-place edit, so edit cancels the queued delivery and
// hands the original text back to the composer (cancel-first is race-free: if the loop already
// consumed it, nothing is refilled); delete is a plain cancel. Refill travels as a callback prop, not
// an emit: the emit happens after an await, and by then the row's removal (local or via the delivery
// SSE) may have unmounted this component - Vue drops emits on unmounted instances.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { PopoverArrow, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
import { i18n } from '../../core/i18n/index.ts';
import { chat } from '../../core/state/chatSlice.ts';
import { toast } from '../../ui/toast.ts';
import Hint from '../../ui/components/Hint.vue';
import Icon from '../../ui/components/Icon.vue';
import BubbleSurface from '../../ui/components/BubbleSurface.vue';
import MenuBackdrop from '../../ui/components/MenuBackdrop.vue';
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
const open=ref(false);
const label=computed(()=>tx(`待发送消息（${shown.value.length} 条）`,`Queued messages (${shown.value.length})`));
// A message joining the queue while the bubble is shut nudges the button.
const trigger=ref<HTMLElement>();
let arrivalAnimation:Animation|undefined;
onUnmounted(()=>arrivalAnimation?.cancel());
async function signalArrival(){
  await nextTick();
  if(open.value||!trigger.value)return;
  arrivalAnimation?.cancel();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  arrivalAnimation=trigger.value.animate([
    {transform:'translateY(0)',color:'var(--fg-subtle)'},
    {transform:reduced?'translateY(0)':'translateY(-3px)',color:'var(--accent)',offset:.4},
    {transform:'translateY(0)',color:'var(--fg-subtle)'}
  ],{duration:reduced?240:360,easing:'ease-out'});
}
let pendingScroll=false;
async function scrollLatest(){
  await nextTick();
  if(open.value&&list.value&&!moving.value){list.value.scrollTo({top:list.value.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});pendingScroll=false;}
}
watch(()=>props.items.map(item=>item.id),(ids,previous)=>{if(previous&&ids.some(id=>!previous.includes(id))){pendingScroll=true;void scrollLatest();void signalArrival();}});
// The rows appear once the bubble has been placed, and fade in: rendered before, their layout
// animation would fly them in from where the bubble was measured off screen.
const placed=ref(false);
watch(open,shown=>{
  placed.value=false;
  if(!shown){release();return;}
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(open.value){placed.value=true;pendingScroll=true;void scrollLatest();}}));
});

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
  <PopoverRoot v-model:open="open">
    <!-- A hint through data-hint, not Hint: a tooltip's popper around the trigger would take the anchor from the popover. -->
    <PopoverTrigger as-child><button ref="trigger" type="button" class="btn ghost composer-queue" :aria-label="label" :data-hint="label">
      <Icon name="queue" class="queue-glyph"/>
      <span class="queue-badge">{{shown.length}}</span>
    </button></PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="queue-bubble" :aria-label="label" side="top" align="start" :side-offset="10" :collision-padding="16" :aria-busy="busy" @open-auto-focus.prevent>
        <BubbleSurface />
        <header class="queue-heading"><span>{{tx('待发送','Queued')}} <small>{{shown.length}}</small></span><span v-if="awaitingAnswer" class="queue-note">{{tx('回答上面的问题后送达','Goes in once the questions above are answered')}}</span></header>
        <div ref="list" class="queue-scroll" @pointermove="slide" @pointerup="release" @pointercancel="release" @touchmove="holdStill">
          <ReorderGroup v-model:values="order" as="div" axis="y" class="queue-list" role="list">
            <AnimatePresence v-if="placed" mode="popLayout">
              <ReorderItem v-for="(item,index) in ordered" :key="item.id" :value="item.id" as="div" class="queue-item" :class="{dragging:moving===item.id}" role="listitem" tabindex="0"
                :drag-listener="false" :drag-controls="controlsOf(item.id)" :initial="reduced?false:{opacity:0}" :animate="{opacity:1}" :exit="reduced?undefined:{opacity:0}"
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
        <PopoverArrow as-child :width="30" :height="9"><span data-bubble-anchor class="queue-tail-anchor" aria-hidden="true" /></PopoverArrow>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  <MenuBackdrop :open="open" @close="open = false" />
</template>

<style>
/* A message bubble with a count on its corner: what is waiting, and how much. */
.composer-queue { position: relative; width: 36px; height: 32px; min-height: 32px; padding: 0; flex: none; color: var(--fg-subtle); }
.composer-queue .queue-glyph { display: block; width: 20px; height: 20px; }
.composer-queue .queue-badge { position: absolute; top: 3px; right: 4px; min-width: 13px; height: 13px; padding: 0 3px; border-radius: 7px; background: var(--accent); color: var(--accent-fg); box-shadow: 0 0 0 1.5px var(--bg-raised); font: 600 8.5px/13px var(--font); font-variant-numeric: tabular-nums; text-align: center; }
.composer-queue[data-state="open"] { color: var(--fg); background: var(--bg-hover); }
.queue-bubble { --bubble-surface: var(--bg-overlay); z-index: 75; width: min(420px, calc(100vw - 32px)); max-height: min(380px, var(--reka-popover-content-available-height)); display: flex; flex-direction: column; border: 1px solid transparent; border-radius: 14px; background: transparent; color: var(--fg); isolation: isolate; transform-origin: var(--reka-popover-content-transform-origin); }
.queue-tail-anchor { display: block; width: 30px; height: 9px; opacity: 0; pointer-events: none; }
</style>
