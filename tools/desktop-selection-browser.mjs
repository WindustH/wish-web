import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';

const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import { createApp, h, shallowRef } from 'vue';
import { useChatScroll } from '/src/features/sessions/useChatScroll.ts';
import Menu from '/src/ui/components/Menu.vue';
import '/src/styles/tokens.css';
import '/src/styles/base.css';
import '/src/styles/components.css';
createApp({setup(){
 const stream=shallowRef({active:true});
 const scrollEl=shallowRef(null);
 const history=Object.fromEntries(['entries','hasMoreBefore','hasMoreAfter','loadingInitial','loadingOlder','loadingNewer','sentRun'].map(k=>[k,shallowRef(k==='entries'?[]:false)]));
 const scroll=useChatScroll({history,scrollEl,groups:shallowRef([]),sessionId:shallowRef('selection'),pageActive:shallowRef(true),running:shallowRef(true),streamState:stream,owns:()=>true,getEpoch:()=>0});
 window.selectionScroll={scroll,stream};
 return {scrollEl};
},render:()=>h(Menu,{context:true,selectsText:true,within:'.body',items:[{key:'all',label:'Copy message'}],selectionItems:[{key:'selection',label:'Copy selection'}],onSelect:(key,text)=>window.chosen={key,text}},{default:()=>h('div',{ref:'scrollEl',style:'margin:80px;width:600px;height:140px;overflow:auto'},[h('p',{class:'body',style:'font:20px/2 monospace;user-select:text'},'Alpha Bravo Charlie Delta Echo'),h('input',{id:'editor',value:'Editable text'}),h('div',{style:'height:1000px'})])})}).mount('#app');
window.fixture=true;
</script></body></html>`;
await browserFixture(html, async ({send,js,until,click})=>{
  const points=await js(`(()=>{const node=document.querySelector('.body').firstChild;const point=i=>{const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+1);const b=r.getBoundingClientRect();return {x:b.left+1,y:b.top+b.height/2}};return {start:point(0),end:point(11)}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...points.start});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...points.end});
  assert.equal(await js('document.querySelectorAll("[role=menuitem]").length'),0,'dragging does not open a menu');
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...points.end});
  await until('!!document.querySelector("[role=menuitem]")','release opens selection menu');
  assert.equal(await js('window.selectionScroll.scroll.stick.value'),false,'native selection releases tail follow');
  await js('window.selectionScroll.stream.value={active:true,text:"new output"}');
  await new Promise(r=>setTimeout(r,50));
  assert.equal(await js('document.querySelector(".body").parentElement.scrollTop'),0,'stream update does not drag selected text to bottom');
  const selected=await js('document.getSelection().toString()');
  assert(selected.includes('Alpha Bravo'));
  assert.equal(await js('document.querySelector("[role=menuitem]").textContent'),'Copy selection');
  await click('[role=menuitem]');
  await until('!!window.chosen','selection action runs');
  assert.deepEqual(await js('window.chosen'),{key:'selection',text:selected});
  await until('!document.querySelector("[role=menuitem]")','selection menu closes');
  await js('document.getSelection().removeAllRanges()');
  for (const dismiss of ['wheel', 'click']) {
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...points.start});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...points.end});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...points.end});
    await until('!!document.querySelector("[role=menuitem]")','selection menu reopens');
    if (dismiss === 'wheel') {
      await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:30,y:30,deltaX:0,deltaY:-40});
    } else {
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:30,y:30,button:'left',buttons:1,clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:30,y:30,button:'left',buttons:0,clickCount:1});
    }
    await until('!document.querySelector("[role=menuitem]")','outside gesture closes menu');
    assert.equal(await js('document.getSelection().isCollapsed'),dismiss === 'click','one outside click clears selection; wheel preserves it');
    await js('document.getSelection().removeAllRanges()');
  }
  await click('.body');
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await js('document.querySelectorAll("[role=menuitem]").length'),0,'plain click does not open selection menu');
  await js('document.querySelector("#editor").focus();document.querySelector("#editor").select()');
  assert.equal(await js('document.querySelectorAll("[role=menuitem]").length'),0,'editable selection keeps native behavior');
  console.log(JSON.stringify({ok:true,checks:['native drag preserved','menu after release','selected text action','plain click','editable selection']}));
});
