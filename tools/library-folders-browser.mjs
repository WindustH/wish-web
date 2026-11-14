import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { browserFixture } from './browserFixture.mjs';
import { libraryMenu } from './libraryMenu.mjs';

const html=String.raw`<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {TooltipProvider} from 'reka-ui';
import Library from '/src/features/sessions/SessionLibrary.vue';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {createBackLayers,setBackLayers} from '/src/ui/backLayers.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/features.css';
registerBrowserPlatform({namespace:'library-folder-test',version:1});setBackLayers(createBackLayers(window));
const mobile=ref(false),mounted=ref(true),session=ref('fixture');window.calls=[];window.folders=[];
const originals=Array.from({length:80},(_,i)=>({id:(i+1).toString(16).padStart(64,'0'),name:'File '+(i+1)+'.bin',mime_type:'application/octet-stream',byte_count:1024,modified_at:1700000000000,visible:true,pinned:false,folder:null}));
window.files=structuredClone(originals);
window.fetch=async(input,options={})=>{
 const url=new URL(String(input),location.href),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
 let data={};
 if(url.pathname.endsWith('/library/folders')&&method==='POST'){data={id:'folder_'+(window.folders.length+1),...body};window.folders.push(data);}
 else if(url.pathname.endsWith('/library/move')){window.calls.push(body);for(const id of body.ids){const file=window.files.find(f=>f.id===id);if(file)file.folder=body.folder;else window.folders.find(f=>f.id===id).parent=body.folder;}}
 else if(url.pathname.endsWith('/blobs')){const scope=url.searchParams.get('folder');const items=window.files.filter(f=>!scope||f.folder===(scope==='/'?null:scope));data={items,next:null,total:items.length,folders:window.folders};}
 else if(url.pathname.endsWith('/meta')){data={...window.files[0],version:'v1'};}
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
createApp({render:()=>h(TooltipProvider,{},()=>h('main',{style:'display:flex;justify-content:flex-end;height:100dvh;'},mounted.value?[h(Library,{session:session.value,mobile:mobile.value,open:true,entries:[],libraryRevision:0})]:[]))}).mount('#app');
window.fixture={mobile,mounted,session,reset(){window.files=structuredClone(originals);window.calls=[];session.value+='x';}};
</script></body></html>`;
await browserFixture(html,async({js,until,click,send})=>{
 const id=n=>n.toString(16).padStart(64,'0'),card=n=>`[data-blob-id="${id(n)}"]`;
 const menu=label=>libraryMenu({js,until,click},label);
 const point=selector=>js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const selected=()=>js('[...document.querySelectorAll("[data-blob-id][aria-pressed=true]")].map(e=>parseInt(e.dataset.blobId,16))');
 const escape=()=>send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 await until('document.querySelectorAll("[data-blob-id]").length>0','catalog');
 await menu('New folder|新建文件夹');
 await until('!!document.querySelector(".library-folder-form input")','folder dialog');
 await js(`(()=>{const input=document.querySelector('.library-folder-form input');input.value='Documents';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.library-folder-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})()`);
 await until('!!document.querySelector("[data-folder-id=folder_1]")','created folder appears');
 await menu('Compact list|紧凑列表');
 await until('!!document.querySelector(".library-view-compact")','compact view');
 assert.equal(await js('!!document.querySelector(".library-thumbnail")'),false,'list views do not fetch thumbnails');
 assert.ok(await js(`document.querySelector(${JSON.stringify(card(1))}).getBoundingClientRect().height`)<42);
 await menu('Details|详细列表');
 await until('!!document.querySelector(".library-file-details")','detail metadata');
 await js('fixture.mounted.value=false');await until('!document.querySelector(".library-scroll")','unmount');
 await js('fixture.mounted.value=true');await until('!!document.querySelector(".library-view-details [data-blob-id]")','view preference restored');
 await menu('Icons|图标');
 await until('!!document.querySelector(".library-view-icons")','icons view');
 // A selected batch moves atomically through the same folder drop target as a single file.
 await js(`document.querySelector(${JSON.stringify(card(1))}).dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));document.querySelector(${JSON.stringify(card(2))}).click()`);
 assert.deepEqual(await selected(),[1,2]);
 await js(`(()=>{const data=new DataTransfer();document.querySelector(${JSON.stringify(card(1))}).dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));const folder=document.querySelector('.library-folder');folder.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));folder.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));window.dispatchEvent(new DragEvent('dragend'));})()`);
 await until('calls.length===1&&!document.querySelector(".library-selection")','selected files moved');
 assert.deepEqual(await js('calls[0]'),{ids:[id(1),id(2)],folder:'folder_1'});
 await click('[data-folder-id=folder_1]');
 await until('document.querySelectorAll("[data-blob-id]").length===2','folder contents');
 assert.equal(await js('document.querySelector(".library-path").textContent.includes("Documents")'),true);
 // Move back to root through breadcrumbs.
 await js(`(()=>{const data=new DataTransfer();document.querySelector(${JSON.stringify(card(1))}).dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));document.querySelector('.library-path [data-drop-place="/"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));window.dispatchEvent(new DragEvent('dragend'));})()`);
 await until('calls.length===2&&document.querySelectorAll("[data-blob-id]").length===1','breadcrumb drop');
 assert.equal(await js('calls[1].folder'),null);
 await click('.library-path [data-drop-place="/"]');
 await js('fixture.reset();fixture.mobile.value=true');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await until(`!!document.querySelector(${JSON.stringify(card(2))})`,'mobile root');
 await menu('Select files|多选文件');
 const touch=async(type,p)=>send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1}]:[]});
 const two=await point(card(2)),five=await point(card(5)),three=await point(card(3));
 await touch('touchStart',two);await pause(520);await touch('touchMove',five);
 await until('document.querySelectorAll("[aria-pressed=true][data-blob-id]").length===4','long press selects range across grid');
 assert.deepEqual(await selected(),[2,3,4,5]);
 await touch('touchMove',three);await pause(80);await touch('touchEnd');
 assert.deepEqual(await selected(),[2,3],'reversing restores baseline outside the range');
 // Ordinary scrolling before the hold timeout must not paint a selection.
 const before=await selected(),p=await point(card(4));
 await touch('touchStart',p);await touch('touchMove',{x:p.x,y:p.y-110});await touch('touchEnd');await pause(550);
 await js('document.querySelector(".library-scroll").scrollTop=0');await pause(100);
 await until(`!!document.querySelector(${JSON.stringify(card(2))})`,'selected virtual rows remount after scroll');
 assert.deepEqual(await selected(),before,'native scrolling leaves the selection unchanged');
 const six=await point(card(6));
 await touch('touchStart',six);await pause(520);
 const edge=await js(`(()=>{const r=document.querySelector('.library-scroll').getBoundingClientRect();return{x:r.x+r.width/2,y:r.bottom-4}})()`);
 await touch('touchMove',edge);await pause(900);await touch('touchEnd');
 assert.ok(await js('document.querySelector(".library-scroll").scrollTop')>100,'selection autoscroll reaches virtual rows');
 await escape();await until('!document.querySelector(".library-selection")','Escape cancels selection');
 await js('document.querySelector(".library-scroll").scrollTop=0');await pause(100);
 const one=await point(card(1)),folder=await point('[data-folder-id=folder_1]');
 await touch('touchStart',one);await pause(520);await touch('touchMove',folder);
 await until('!!document.querySelector(".sl-touch-ghost")','ordinary long press drags file');
 await touch('touchEnd');
 await until('calls.length===1','touch drop moves file');
 assert.deepEqual(await js('calls[0]'),{ids:[id(1)],folder:'folder_1'});
 assert.equal(await js('!!document.querySelector(".library-file-title")'),false,'drop does not open preview');
 await menu('Select files|多选文件');
 await click(card(2));
 assert.ok(await js(`(()=>{const e=document.querySelector('.library-selection'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.scrollWidth<=r.width+1})()`),'five-action island fits mobile');
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/wish-library-folders-mobile.png',Buffer.from(shot.data,'base64'));
 console.log('Library folders: creation, views, persistence, batch/root drops, mobile range/reversal/scroll/drop passed');
});
