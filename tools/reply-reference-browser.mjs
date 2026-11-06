import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {browserFixture} from './browserFixture.mjs';
const html=`<!doctype html><html data-theme="dark"><body><div id="app"></div><script type="module">
import {createApp,h,ref,provide,nextTick} from 'vue';
import {TooltipProvider} from 'reka-ui';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {replyContextKey} from '/src/domain/references/context.ts';
import {chat} from '/src/core/state/chatSlice.ts';
import Composer from '/src/domain/chat/Composer.vue';
import MessageContext from '/src/domain/chat/entries/MessageContext.vue';
import ReplyText from '/src/domain/chat/ReplyText.vue';
import Markdown from '/src/ui/components/Markdown.vue';
import ImagePreview from '/src/domain/media/ImagePreview.vue';
import RegionSelection from '/src/domain/media/RegionSelection.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'reply-test',version:1});chat.sessionId.value='s';chat.send=async(text,attachments,metadata)=>{window.sent={text,attachments,metadata};return '99'};
window.references=[];window.located=[];window.jumped=[];window.previews=[];
const source='First **same** then second **same**.';
const revision=ref(0), completed=ref(false), composer=ref(null), canvas=ref(null);
window.complete=()=>{completed.value=true;revision.value++};
const sample=document.createElement('canvas');sample.width=800;sample.height=400;const paint=sample.getContext('2d');paint.fillStyle='orange';paint.fillRect(0,0,800,400);paint.fillStyle='blue';paint.fillRect(400,0,400,400);
const src=sample.toDataURL();
createApp({setup(){provide(replyContextKey,{session:ref('s'),revision,
 add:async(reference,image)=>{window.references.push({reference,size:image?.size});await composer.value.reference(reference,image)},
 locate:reference=>window.located.push(reference),jump:seq=>window.jumped.push(seq),
 links:async()=>completed.value?[{input:99,reply:100,references:window.references.map(v=>v.reference)}]:[],
 preview:async seq=>{window.previews.push(seq);return '# The model reply\\n\\nThis is the answer, not the quoted text.'}});
return()=>h(TooltipProvider,{},()=>h('main',{},[
 h('div',{id:'message',class:'entry assistant',style:'width:650px;margin:20px'},[h(MessageContext,{text:source,kind:'assistant'},()=>h('div',{class:'body'},[h(ReplyText,{seq:42,block:0,text:source},()=>h(Markdown,{text:source,'data-selectable-text':''}))]))]),
 h('div',{id:'image',style:'width:500px;height:250px;margin:20px'},[h(ImagePreview,{src,alt:'Test image',stateKey:'s/image',reference:{session:'s',blob:'a'.repeat(64)}})]),
 h('div',{id:'pdf',style:'position:relative;width:300px;height:160px;margin:20px'},[h('canvas',{ref:canvas,width:600,height:320,style:'width:300px;height:160px;background:white'}),h(RegionSelection,{target:canvas.value,session:'s',blob:'b'.repeat(64),page:2,name:'Report.pdf',dimensions:{width:300,height:160}})]),
 h('div',{style:'position:fixed;bottom:10px;left:20px;width:650px'},[h(Composer,{ref:composer,owner:'s',mobile:false})])]));}}).mount('#app');window.fixture=true;
</script></body></html>`;
await browserFixture(html,async({js,until,click,send})=>{
 await until('document.querySelector("#image img")?.naturalWidth===800','image loaded');
 await js(`(()=>{const el=document.querySelectorAll('#message strong')[1],range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);const b=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:b.left+4,clientY:b.top+4}));})()`);
 await until('[...document.querySelectorAll("[role=menuitem]")].some(e=>/回复|Reply/.test(e.textContent))','selection reply menu');
 await js(`[...document.querySelectorAll('[role=menuitem]')].find(e=>/回复|Reply/.test(e.textContent)).click()`);
 await until('document.querySelector(".reply-reference-token")','reference chip');
 const ref=await js('window.references[0].reference');
 assert.equal(ref.seq,42);assert.equal(ref.block,0);assert.equal(ref.start,27);assert.equal(ref.text,'**same**');
 assert.equal(await js('document.querySelectorAll(".reply-underlines i").length'),0,'no backlink before completion');
 await click('.reply-reference-token');assert.equal(await js('window.located[0].start'),27);
 // Moving the atomic chip must not activate it.
 await js(`document.querySelector('[contenteditable]').focus();document.execCommand('insertText',false,' trailing words')`);
 await js(`document.querySelector('.reply-reference-token').append(document.createTextNode(' Long quoted text'.repeat(100)))`);
 const chip=await js(`(()=>{const b=document.querySelector('.reply-reference-token').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
 const count=await js('window.located.length');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...chip});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:chip.x+180,y:chip.y});
 assert.equal(await js(`(()=>{const ghost=document.querySelector('body > .reply-reference-token');if(!ghost)return false;const style=getComputedStyle(ghost);return style.overflow==='hidden'&&style.textOverflow==='ellipsis'&&ghost.getBoundingClientRect().width<=280&&ghost.scrollWidth>ghost.clientWidth})()`),true,'long drag preview retains bounded width and ellipsis outside the editor');
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:chip.x+180,y:chip.y});
 assert.equal(await js('window.located.length'),count,'drag does not jump');
 await js('getSelection().removeAllRanges();window.complete()');
 await until('document.querySelectorAll(".reply-underlines i").length>0','successful response adds underlines');
 const box=await js(`(()=>{const b=document.querySelectorAll('#message strong')[1].getBoundingClientRect();return {x:b.left+5,y:b.top+5}})()`);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',...box});
 await until('document.querySelector(".reply-preview")?.textContent.includes("This is the answer")','hover shows model reply');
 assert.equal(await js('window.previews[0]'),100);
 await writeFile('/tmp/wish-reply-preview.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 assert.equal(await js('document.querySelectorAll(".reply-preview button,.reply-preview-heading").length'),0,'hover preview contains only the reply');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});
 assert.equal(await js('window.jumped[0]'),100,'clicking the quoted text jumps to the answer');
 async function selectRegion(selector){
  const b=await js(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:b.x+b.w*.25,y:b.y+b.h*.25});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:b.x+b.w*.75,y:b.y+b.h*.75});
  assert.equal(await js('!!document.querySelector(".region-selection-mask")'),true,'mask appears while dragging');
  await js(`document.querySelector('#message').dispatchEvent(new Event('scroll'));document.querySelector('#message').dispatchEvent(new WheelEvent('wheel',{bubbles:true}));window.complete();window.dispatchEvent(new Event('resize'));`);
  assert.equal(await js('!!document.querySelector(".region-selection-mask")'),true,'history refresh and unrelated scroll preserve active selection');
  await js(`document.querySelector(${JSON.stringify(selector)}).parentElement.dispatchEvent(new Event('scroll'))`);
  assert.equal(await js('!!document.querySelector(".region-selection-mask")'),true,'media ancestor scroll preserves captured gesture');

  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:b.x+b.w*.75,y:b.y+b.h*.75});
  await js(`document.querySelector('#message').dispatchEvent(new Event('scroll'));document.querySelector('#message').dispatchEvent(new WheelEvent('wheel',{bubbles:true}))`);
  assert.equal(await js('!!document.querySelector(".region-reply-menu")'),true,'unrelated activity also preserves completed selection');
  await writeFile('/tmp/wish-region-'+(selector.includes('pdf')?'pdf':'image')+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await click('.region-reply-menu button');
 }
 await selectRegion('#image img');await until('window.references.length===2','image reply');
 const image=await js('window.references[1]');assert.ok(image.size>0);assert.equal(image.reference.region.unit,'px');assert.ok(Math.abs(image.reference.region.x-200)<3);assert.ok(Math.abs(image.reference.region.width-400)<3);
 await selectRegion('#pdf canvas');await until('window.references.length===3','PDF reply');
 const pdf=await js('window.references[2]');assert.equal(pdf.reference.page,2);assert.equal(pdf.reference.region.unit,'pt');assert.ok(Math.abs(pdf.reference.region.x-75)<1);assert.equal(pdf.reference.label.includes('Report.pdf'),true);
 // Submit through the actual composer to check model text, images and durable metadata.
 await js(`document.querySelector('[contenteditable]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
 await until('!!window.sent','reference message submitted');
 const sent=await js('({text:window.sent.text,refs:window.sent.metadata.reply_references,images:window.sent.attachments.map(a=>({kind:a.kind,bytes:a.bytes.byteLength,placeholder:a.placeholder}))})');
 assert.ok(sent.text.includes('> **same**'));assert.ok(sent.text.includes('page=2'));assert.ok(sent.text.includes('coordinates(top-left, pt)'));
 assert.equal(sent.refs.length,3);assert.equal(sent.images.length,2);assert.ok(sent.images.every(i=>i.kind==='image'&&i.bytes>0));
 assert.equal(await js(`Promise.all(window.sent.attachments.map(async a=>a.placeholder === '<image-'+[...new Uint8Array(await crypto.subtle.digest('SHA-256',a.bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')+'>')).then(results=>results.every(Boolean))`),true,'image placeholders use actual content digests');
 console.log('Reply selection: exact repeated-text offsets, atomic activation/drag, completed backlink hover/jump, image/PDF region coordinates and model payload passed');
});
