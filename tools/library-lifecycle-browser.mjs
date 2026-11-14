import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';

const html = String.raw`<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {TooltipProvider} from 'reka-ui';
import Library from '/src/features/sessions/SessionLibrary.vue';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'library-lifecycle-test',version:1});
const open=ref(false),session=ref('fixture'),mounted=ref(true);
window.reads=[];window.mutations=[];window.pending=0;window.aborted=0;window.legacy=false;
window.folders=[{id:'folder_test',name:'Documents',parent:null}];
window.files=Array.from({length:4},(_,i)=>({id:String(i+1).repeat(64),name:'file '+i+'.txt',mime_type:'text/plain',byte_count:10,modified_at:0,visible:true,pinned:false,folder:i<2?null:'folder_test'}));
window.fetch=async(input,options={})=>{
 const url=new URL(String(input),location.href),method=options.method||'GET';let data={},status=200;
 if(method==='PATCH'){
  window.mutations.push(url.pathname);window.pending++;
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,3000);options.signal.addEventListener('abort',()=>{window.aborted++;clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true});});}
  finally{window.pending--;}
 }else if(url.pathname.endsWith('/blobs')){
  const folder=url.searchParams.get('folder');window.reads.push(folder);
  if(window.legacy&&folder){status=400;data={error:{message:'unknown field folder'}};}
  else if(folder&&folder!=='/'&&!window.folders.some(f=>f.id===folder)){status=404;data={error:{message:'not found'}};}
  else {const items=window.files.filter(f=>!folder||f.folder===(folder==='/'?null:folder));data={items,total:items.length,next:null,...(window.legacy?{}:{folders:window.folders})};}
 }
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
};
createApp({render:()=>h(TooltipProvider,{},()=>h('main',{style:'display:flex;justify-content:flex-end;height:100dvh'},mounted.value?[h(Library,{session:session.value,open:open.value,mobile:false,entries:[],libraryRevision:0})]:[]))}).mount('#app');
window.fixture={open,session,mounted};
</script></body></html>`;

await browserFixture(html, async ({js,until,click}) => {
  await until('!!window.fixture', 'component mounted while closed');
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  assert.deepEqual(await js('reads'), [], 'closed library does not fetch eagerly');
  await js('fixture.open.value=true');
  await until('document.querySelectorAll("[data-blob-id]").length===2', 'root files');
  assert.deepEqual(await js('reads'), ['/'], 'folder-capable backend needs only one initial request');
  const selectTwo = () => js(`(()=>{const files=[...document.querySelectorAll('[data-blob-id]')];files[0].dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));files[1].click()})()`);
  await selectTwo();
  await until('document.querySelectorAll("[data-blob-id][aria-pressed=true]").length===2', 'two files selected');
  await js('document.querySelector(".library-batch-pin").click()');
  await until('pending===1', 'batch starts');
  await js('fixture.open.value=false');
  await until('pending===0', 'closing cancels in-flight mutation');
  assert.equal(await js('mutations.length'),1,'closing prevents the rest of a batch');
  await js('fixture.open.value=true');
  await until('!!document.querySelector("[data-folder-id=folder_test]")', 'library reopens');
  await js('document.querySelector("[data-folder-id=folder_test]").click()');
  await until('document.querySelector(".library-path")?.textContent.includes("Documents")', 'folder opens');
  await selectTwo();
  await until('document.querySelectorAll("[data-blob-id][aria-pressed=true]").length===2', 'folder files selected');
  await js('document.querySelector(".library-batch-pin").click()');
  await until('pending===1', 'folder batch starts');
  await click('.library-path [data-drop-place="/"]');
  await until('pending===0&&!document.querySelector(".library-selection")', 'directory change cancels batch');
  assert.equal(await js('mutations.length'),2,'old folder batch cannot mutate more files');
  assert.equal(await js('aborted'),2);
  // A deleted persisted folder recovers to root on reopening, not a permanent 404 screen.
  await js('document.querySelector("[data-folder-id=folder_test]").click()');
  await until('document.querySelector(".library-path")?.textContent.includes("Documents")', 'folder selected again');
  await js('fixture.open.value=false');
  await js('folders=[];fixture.open.value=true');
  await until(`!!document.querySelector('[data-blob-id^="1"]')`, 'missing folder falls back to root');
  assert.equal(await js('!!document.querySelector(".library-path")'), false);
  // A legacy strict server rejects the new query parameter; fallback remains supported.
  await js('fixture.mounted.value=false');
  await until('!document.querySelector(".library-scroll")', 'old backend view disposed');
  await js('legacy=true;reads=[];fixture.session.value="legacy";fixture.open.value=true;fixture.mounted.value=true');
  await until('document.querySelectorAll("[data-blob-id]").length===4', 'legacy unscoped listing');
  assert.deepEqual(await js('reads'), ['/',null]);
  console.log('Library lifecycle: lazy single fetch, close/folder cancellation, deleted folder recovery and legacy fallback passed');
});
