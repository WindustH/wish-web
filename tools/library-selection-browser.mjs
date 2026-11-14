import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { browserFixture } from './browserFixture.mjs';
import { libraryMenu } from './libraryMenu.mjs';

const html = String.raw`<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';
import {TooltipProvider} from 'reka-ui';
import Library from '/src/features/sessions/SessionLibrary.vue';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {createBackLayers,setBackLayers} from '/src/ui/backLayers.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'library-selection-test',version:1});
setBackLayers(createBackLayers(window));
const session=ref('fixture'),mobile=ref(false),open=ref(true);
const originals=Array.from({length:8},(_,i)=>({id:(i+1).toString(16).repeat(64),name:'Chapter '+(i+1)+'.docx',mime_type:'application/octet-stream',byte_count:1024,modified_at:i,visible:true,pinned:false,available:i!==2,linked:true}));
window.files=structuredClone(originals);window.calls=[];window.mentions=[];window.libraryClosed=0;window.fail='';window.delay=0;window.inFlight=0;window.maxInFlight=0;
window.fetch=async(input,options={})=>{
 const url=new URL(String(input),location.href),method=options.method||'GET';
 const id=url.pathname.match(/blobs\/([a-f0-9]{64})/)?.[1];
 let data={},status=200;
 if(method==='PATCH'||method==='DELETE'){
  const changes=options.body?JSON.parse(options.body):null;
  window.calls.push({id,method,changes,owner:url.pathname.split('/')[3]});
  window.maxInFlight=Math.max(window.maxInFlight,++window.inFlight);
  try{
   await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,window.delay||20);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true});});
   if(window.fail===id){status=409;data={error:{code:'state_conflict',message:'File is still needed by the current context'}};}
   else if(method==='DELETE')window.files=window.files.filter(file=>file.id!==id);
   else{const file=window.files.find(file=>file.id===id);Object.assign(file,changes);if(changes.pinned)file.visible=true;data={visible:file.visible,pinned:file.pinned};}
  }finally{window.inFlight--;}
 }else if(url.pathname.endsWith('/blobs')){
  const all=window.files.filter(file=>url.searchParams.get('include_hidden')==='true'||file.visible);
  const start=Number(url.searchParams.get('start')||0),end=Math.min(start+4,all.length);
  data={items:all.slice(start,end),next:end<all.length?end:null,total:all.length};
 }else if(id)data={...window.files.find(file=>file.id===id),version:'fixture'};
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
};
createApp({render:()=>h(TooltipProvider,{},()=>h('main',{style:'display:flex;justify-content:flex-end;height:100dvh;'},[
 h(Library,{session:session.value,mobile:mobile.value,open:open.value,entries:[],libraryRevision:0,onClose(){window.libraryClosed++;open.value=false;},onMention(files){window.mentions.push(files);}})
]))}).mount('#app');
window.fixture={session,mobile,open,reset(name){window.files=structuredClone(originals);window.calls=[];window.fail='';window.delay=0;session.value=name;}};
</script></body></html>`;

await browserFixture(html, async ({ js, until, click, send }) => {
  const menu = label => libraryMenu({ js, until, click }, label);
  const id = (n) => n.toString(16).repeat(64);
  const card = (n) => '.library-item[data-blob-id="' + id(n) + '"]';
  const chosen = () =>
    js('[...document.querySelectorAll(".library-item[aria-pressed=true]")].map(el=>el.dataset.blobId)');
  const press = async (selector, modifiers = 0) => {
    await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
    const point = await js(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      modifiers,
      ...point,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      modifiers,
      ...point,
    });
  };
  const escape = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  };
  const reset = async (name) => {
    await js(`fixture.reset(${JSON.stringify(name)})`);
    await until(
      `document.querySelectorAll('.library-item').length===4 && !!document.querySelector(${JSON.stringify(card(1))}) && !document.querySelector('.library-selection, .modal-card')`,
      'fresh session',
    );
  };
  const selectedCount = async (count) =>
    until(
      `document.querySelectorAll('.library-item[aria-pressed=true]').length===${count}`,
      'selection count ' + count,
    );
  await until('document.querySelectorAll(".library-item").length===4', 'initial catalog');

  await press(card(1), 8);
  await selectedCount(1);
  assert.equal(
    await js('!!document.querySelector(".library-file-title")'),
    false,
    'Shift click selects without preview',
  );
  await press(card(3));
  await selectedCount(2);
  await press(card(3));
  await selectedCount(1);
  await press(card(1));
  await selectedCount(0);
  await press(card(4), 8);
  await selectedCount(4);
  assert.deepEqual(await chosen(), [1, 2, 3, 4].map(id));
  assert.equal(await js('getSelection().toString()'), '', 'Shift selection never highlights filenames');
  await escape();
  await until('!document.querySelector(".library-selection")', 'Escape clears mode');
  assert.equal(await js('libraryClosed'), 0, 'Escape does not close the sidebar');
  await press(card(1));
  await until('!!document.querySelector(".library-file-title")', 'normal click opens preview');
  await escape();
  await until('!!document.querySelector(".library-grid")', 'Escape returns from preview');

  await menu('Select files|多选文件');
  await press(card(1));
  await press(card(2));
  await click('.library-batch-mention');
  await until('mentions.length===1', 'batch mention');
  assert.deepEqual(await js('mentions[0].map(file=>file.id)'), [id(1), id(2)]);
  assert.equal(await js('mentions[0].every(file=>file.owner==="fixture"&&file.name&&file.mime&&file.size)'), true);

  await press(card(1), 8);
  await press(card(2));
  await click('.library-batch-pin');
  await until('calls.length===2 && !document.querySelector(".library-selection")', 'batch pin');
  assert.deepEqual(await js('calls.map(call=>call.changes)'), [{ pinned: true }, { pinned: true }]);
  await press(card(1), 8);
  await press(card(2));
  assert.match(await js('document.querySelector(".library-batch-pin").textContent'), /Unpin|取消置顶/);
  await click('.library-batch-pin');
  await until('calls.length===4 && !document.querySelector(".library-selection")', 'batch unpin');
  assert.deepEqual(await js('calls.slice(2).map(call=>call.changes)'), [{ pinned: false }, { pinned: false }]);

  await js(`window.fail=${JSON.stringify(id(2))};window.calls=[]`);
  await press(card(1), 8);
  await press(card(3), 8);
  await click('.library-batch-pin');
  await until('calls.length===3 && !document.querySelector(".library-batch-pin").disabled', 'partial failure settles');
  assert.deepEqual(await chosen(), [id(2)], 'only failed files remain selected');
  assert.equal(await js('maxInFlight'), 1, 'batch mutations are bounded and sequential');
  await js('window.fail=""');
  await click('.library-batch-pin');
  await until('calls.length===4 && !document.querySelector(".library-selection")', 'retry only the failed file');
  assert.equal(await js('calls[3].id'), id(2));

  await press(card(1), 8);
  await press(card(3), 8);
  await click('.library-batch-visible');
  await until(
    '!document.querySelector(".library-selection") && files.slice(0,3).every(file=>!file.visible)',
    'batch hide',
  );
  await menu('Show all files|查看全部文件');
  await until(`!!document.querySelector(${JSON.stringify(card(1))})`, 'all files view');
  await press(card(1), 8);
  await press(card(3), 8);
  assert.match(await js('document.querySelector(".library-batch-visible").textContent'), /Show|显示/);
  await click('.library-batch-visible');
  await until('!document.querySelector(".library-selection") && files.every(file=>file.visible)', 'batch show');

  await reset('pagination');
  await menu('Select files|多选文件');
  assert.match(await js('document.querySelector(".library-select-all").textContent'), /loaded|已加载/);
  await click('.library-select-all');
  await selectedCount(4);
  await press('.library-more');
  await until('document.querySelectorAll(".library-item").length===8', 'second page');
  await selectedCount(4);
  await click('.library-select-all');
  await selectedCount(8);
  await escape();
  await until('!document.querySelector(".library-selection")', 'clear paged selection');

  await reset('deletion');
  await press(card(1), 8);
  await press(card(2));
  await click('.library-batch-delete');
  await until('!!document.querySelector(".library-confirm-delete")', 'delete confirmation');
  await escape();
  await until('!document.querySelector(".library-confirm-delete")', 'Escape only dismisses confirmation');
  await selectedCount(2);
  assert.equal(await js('calls.length'), 0);
  await js(`window.fail=${JSON.stringify(id(2))}`);
  await click('.library-batch-delete');
  await until('!!document.querySelector(".library-confirm-delete")', 'reopen confirmation');
  await click('.library-confirm-delete');
  await until(
    'calls.length===2 && !document.querySelector(".library-confirm-delete") && !document.querySelector(".library-batch-delete").disabled',
    'partial deletion',
  );
  assert.deepEqual(await chosen(), [id(2)]);
  assert.equal(await js(`files.some(file=>file.id===${JSON.stringify(id(1))})`), false);
  await js('window.fail=""');
  await click('.library-batch-delete');
  await until('!!document.querySelector(".library-confirm-delete")', 'retry confirmation');
  await click('.library-confirm-delete');
  await until('calls.length===3 && !document.querySelector(".library-selection")', 'delete retry');

  await reset('old-owner');
  await press(card(1), 8);
  await press(card(2));
  await js('window.delay=1000');
  await click('.library-batch-pin');
  await until('calls.length===1', 'first mutation in flight');
  await js('fixture.session.value="new-owner"');
  await until('!document.querySelector(".library-selection") && inFlight===0', 'session switch cancels batch');
  assert.equal(await js('calls.length'), 1, 'remaining old-session mutations never run');

  await js('window.delay=0;fixture.mobile.value=true');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: false });
  await until('!!document.querySelector(".island-overlay")', 'mobile sidebar');
  await until(
    'document.querySelector(".island-overlay").getAnimations().every(animation=>animation.playState!=="running")',
    'mobile entrance finishes',
  );
  await menu('Select files|多选文件');
  await until('!!document.querySelector(".library-selection")', 'mobile selection mode');
  await press(card(1));
  await selectedCount(1);
  await press(card(2));
  await selectedCount(2);
  assert.ok(
    await js(
      '(()=>{const box=document.querySelector(".library-selection").getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.bottom<=innerHeight&&document.querySelector(".library-selection").scrollWidth<=box.width+1})()',
    ),
    'selection toolbar fits a narrow screen',
  );
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/wish-library-selection.png', Buffer.from(screenshot.data, 'base64'));
  await js('history.back()');
  await until('!document.querySelector(".library-selection")', 'mobile Back clears selection');
  assert.equal(await js('libraryClosed'), 0, 'first Back preserves sidebar');
  await js('history.back()');
  await until('libraryClosed===1', 'second Back closes sidebar');
  console.log(
    'Library multi-selection: Shift range, normal preview, Esc/modal/Back layers, mention, pin/unpin, hide/show, pagination, partial failure/retry, owner cancellation and mobile layout passed',
  );
});
