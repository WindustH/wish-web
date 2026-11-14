import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';
const html=`<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref,provide} from 'vue';import {TooltipProvider} from 'reka-ui';
import Cards from '/src/features/sessions/entries/BlobMentionCards.vue';
import Dialogs from '/src/features/sessions/ActivityDialogs.vue';
import {openActivityKey} from '/src/features/sessions/activityDialogs.ts';
import {fileMentionKey} from '/src/domain/references/useFileMention.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
const count=ref(3),visible=ref(true),request=ref(null),session=ref('fixture');let serial=0;window.opened=[];
const files=Array.from({length:8},(_,i)=>({key:'file-'+i,mention:{session:'fixture',id:String(i).repeat(64),name:'Document '+i+'.pdf',...(i===0?{page:3}:i===1?{time:42}:{})}}));
createApp({setup(){provide(openActivityKey,r=>request.value={...r,requestId:++serial});provide(fileMentionKey,async file=>{window.opened.push(file)});
return()=>h(TooltipProvider,{},()=>h('main',{style:'padding:24px'},[
 visible.value?h(Cards,{files:files.slice(0,count.value)}):null,
 h(Dialogs,{key:session.value,chips:[],request:request.value,session:session.value,onDismiss:()=>request.value=null})
]));}}).mount('#app');window.fixture={count,visible,request,session};
</script></body></html>`;
await browserFixture(html,async({js,send,until,click})=>{
 await until('document.querySelectorAll(".blob-mention-card").length===3','three individual cards');
 assert.equal(await js('document.querySelectorAll(".blob-mention-card > svg:first-child").length'),3,'all file types render an icon');
 assert.equal(await js('!!document.querySelector(".mention-stack")'),false);
 await js('fixture.count.value=4');
 await until('!!document.querySelector(".mention-stack-card")','four cards collapse');
 assert.ok(await js('!!document.querySelector(".mention-stack-card svg")'),'stack renders its file icon');
 assert.equal(await js('document.querySelectorAll(".blob-mention-card").length'),0);
 await js('document.querySelector(".mention-stack-card").focus()');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until('document.querySelectorAll(".modal-card .blob-mention-card").length===4','keyboard opens complete list');
 await js('fixture.visible.value=false');
 await until('!document.querySelector(".mention-stack")','virtual row recycled');
 assert.equal(await js('document.querySelectorAll(".modal-card .blob-mention-card").length'),4,'dialog survives virtual row recycling');
 await js('document.querySelector(".modal-card .blob-mention-card").click()');
 await until('!document.querySelector(".modal-card")','choosing file closes dialog');
 assert.equal(await js('opened[0].page'),3);
 assert.equal(await js('opened[0].kind'),'blob');
 await js('fixture.visible.value=true;fixture.count.value=8');
 await click('.mention-stack-card');
 await until('document.querySelectorAll(".modal-card .blob-mention-card").length===8','all eight files visible');
 await js('document.querySelectorAll(".modal-card .blob-mention-card")[1].click()');
 await until('!document.querySelector(".modal-card")','timestamp file opens');
 assert.equal(await js('opened[1].time'),42);
 await click('.mention-stack-card');
 await until('!!document.querySelector(".modal-card")','reopen');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until('!document.querySelector(".modal-card")','Escape closes');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await click('.mention-stack-card');
 await until('document.querySelectorAll(".modal-card .blob-mention-card").length===8','phone list');
 assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow on phone');
 await js('fixture.request.value=null;fixture.session.value="other"');
 await until('!document.querySelector(".modal-card")','session switch closes dialog');
 console.log('Mention stacks: 3/4 threshold, complete list, keyboard, virtual recycling, page/time targets, close and phone layout passed');
});
