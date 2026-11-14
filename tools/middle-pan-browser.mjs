import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="2400"><rect width="400" height="2400" fill="tan"/></svg>');
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';
import ImagePreview from '/src/domain/media/ImagePreview.vue';
import {useMiddlePan} from '/src/ui/composables/useMiddlePan.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'middle-pan-test',version:1});
window.events=[];window.pastes=0;
window.addEventListener('auxclick',e=>window.events.push({button:e.button,prevented:e.defaultPrevented}));
window.addEventListener('paste',()=>window.pastes++);
createApp({setup(){const scroll=ref();useMiddlePan(scroll);return()=>h('main',[
 h('textarea',{id:'composer',style:'position:fixed;left:20px;top:20px;width:200px;height:150px;'}),
 h('div',{style:'position:fixed;left:300px;top:20px;width:400px;height:400px;'},[h(ImagePreview,{src:${JSON.stringify(image)},alt:'long image',stateKey:'middle-pan'})]),
 h('div',{ref:scroll,id:'pdf-scroll',style:'position:fixed;left:300px;top:460px;width:400px;height:200px;overflow:auto;'},[h('div',{style:'height:1800px'},'PDF scrolling surface')])
]);}}).mount('#app');window.fixture=true;
</script></body></html>`;
await browserFixture(html,async({send,js,until})=>{
 await until('document.querySelector(".image-viewport img")?.naturalWidth>0','image loads');
 await js('document.querySelector("#composer").focus()');
 const drag=async(x,y,endX,endY)=>{
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'middle',buttons:4,clickCount:1,x,y});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'middle',buttons:4,x:endX,y:endY});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'middle',buttons:0,clickCount:1,x:endX,y:endY});
 };
 // Even a middle click at fit size must not paste into the focused composer.
 await drag(500,200,500,200);
 assert.equal(await js('events.at(-1)?.prevented'),true);
 await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:500,y:200,deltaX:0,deltaY:-1200});
 await until('document.querySelector(".image-viewport").classList.contains("zoomed")','image zooms');
 const before=await js('document.querySelector(".image-viewport img").style.transform');
 await drag(500,250,500,180);
 assert.notEqual(await js('document.querySelector(".image-viewport img").style.transform'),before,'image still pans');
 assert.equal(await js('events.at(-1)?.prevented'),true);
 // Pointer capture must protect release outside the preview, including over the composer.
 await drag(500,250,100,100);
 assert.equal(await js('events.at(-1)?.prevented'),true,'release outside preview is guarded');
 await drag(500,600,500,500);
 assert.ok(await js('document.querySelector("#pdf-scroll").scrollTop>0'),'PDF still pans');
 assert.equal(await js('events.at(-1)?.prevented'),true);
 assert.equal(await js('pastes'),0);
 assert.equal(await js('document.querySelector("#composer").value'),'');
 const defaults=await js(`(()=>{const host=document.querySelector('.image-viewport');return [0,1,2].map(button=>['mousedown','mouseup','auxclick','pointerup'].map(type=>host.dispatchEvent(new MouseEvent(type,{button,bubbles:true,cancelable:true}))));})()`);
 assert.deepEqual(defaults,[[true,true,true,true],[false,false,false,false],[true,true,true,true]],'only middle-button defaults are cancelled');
 assert.equal(await js(`document.querySelector('#composer').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true}))`),true,'ordinary composer paste remains available');
 console.log('Middle pan: image/PDF movement, native auxclick cancellation, outside release and ordinary paste passed');
});
