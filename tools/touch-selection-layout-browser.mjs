import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {createRouter,createMemoryHistory} from 'vue-router';
import Selection from '/src/ui/components/TouchSelection.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';
const active=ref(true),height=ref(20);window.frames=0;
const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>{window.frames++;return raf(cb)};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});
createApp({setup(){return()=>h('main',[
 h('div',{'data-selection-viewport':'',style:'height:500px;overflow:auto;position:relative;padding:30px'},[
 h('div',{style:'height:'+height.value+'px'}), h('p',{'data-selectable-text':'',id:'words',style:'font:20px/1.5 sans-serif'},'Select these words and keep them aligned.')]),
 active.value?h(Selection):null
]);}}).use(router).mount('#app');window.fixture={active,height};
window.press=()=>{const el=document.querySelector('#words'),r=document.createRange();r.setStart(el.firstChild,1);r.setEnd(el.firstChild,2);const box=r.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,clientX:box.x+box.width/2,clientY:box.y+box.height/2}))};
window.release=()=>document.querySelector('#words').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',isPrimary:true}));
</script></body></html>`;
await browserFixture(html, async ({js,until})=>{
 await until('!!window.fixture','selection fixture');
 await js('press()');
 await until('!!document.querySelector(".ts-mark")','hold selects word');
 await js('release()');
 await new Promise(r=>setTimeout(r,150));
 const before=await js('({y:document.querySelector(".ts-mark").getBoundingClientRect().y,frames})');
 await new Promise(r=>setTimeout(r,500));
 assert.ok(await js(`frames-${before.frames}<=2`),'selection does not poll animation frames while idle');
 await js('fixture.height.value=100');
 await until(`Math.abs(document.querySelector('.ts-mark').getBoundingClientRect().y-${before.y+80})<2`,'marks follow a preceding layout change');
 // Replace the anchor before the next layout observer can clear the range. Pointer capture
 // is stubbed only for this synthetic event; Range APIs and DOM replacement remain native.
 await js(`(()=>{const handle=document.querySelector('.ts-handle.end');handle.setPointerCapture=()=>{};
   const box=handle.getBoundingClientRect();handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,clientX:box.x,clientY:box.y}));
   document.querySelector('#words').textContent='Replacement text while streaming.';
   handle.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:7,clientX:box.x+20,clientY:box.y}));})()`);
 await until('!document.querySelector(".ts-mark")','detached selection anchor is cleared without a Range exception');
 await js('fixture.active.value=false');
 await until('!document.querySelector(".ts-mark")','unmount clears selection');
 await js('fixture.active.value=true');
 await new Promise(r=>setTimeout(r,30));
 await js('press();fixture.active.value=false');
 await new Promise(r=>setTimeout(r,650));
 assert.equal(await js('!!document.querySelector(".ts-mark")'),false,'unmounted hold never creates selection');
 console.log('Touch selection: no idle rAF polling, preceding layout changes, unmount and hold timer cleanup passed');
});
