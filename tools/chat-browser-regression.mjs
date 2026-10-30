// Isolated real-browser transcript regression. Uses synthetic history, never a live backend.
// Run: node tools/chat-browser-regression.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import { createApp, h, ref, provide } from 'vue';
import { TooltipProvider } from 'reka-ui';
import GenerationInspector from '/src/features/sessions/GenerationInspector.vue';
import ContextInspector from '/src/features/sessions/ContextInspector.vue';
import ToolExecutionRow from '/src/domain/settings/ToolExecutionRow.vue';
import PickerDialog from '/src/domain/providers/PickerDialog.vue';
import Modal from '/src/ui/components/Modal.vue';
import VirtualImageGrid from '/src/domain/chat/entries/VirtualImageGrid.vue';
import VirtualRows from '/src/ui/components/VirtualRows.vue';
import GroupLog from '/src/features/groups/GroupLog.vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import ChatLog from '/src/features/sessions/ChatLog.vue';
import { chat } from '/src/core/state/chatSlice.ts';
import { registerBrowserPlatform } from '/src/platform/browser/index.ts';
import { pageActivityKey } from '/src/ui/composables/usePageActivity.ts';
import { createBackLayers, setBackLayers } from '/src/ui/backLayers.ts';
import { applyTokens } from '/src/ui/applyTokens.ts';
import '/src/styles/tokens.css'; import '/src/styles/base.css'; import '/src/styles/layout.css';
import '/src/styles/components.css'; import '/src/styles/features.css';
window.fixtureErrors=[]; window.addEventListener('error',event=>window.fixtureErrors.push(event.message));
registerBrowserPlatform({ namespace: 'wish-webui', version: 1 }); applyTokens(); setBackLayers(createBackLayers(window));
chat.sessionId.value='fixture'; chat.loadingInitial.value=false;
chat.entries.value=Array.from({length:2000},(_,i)=>({seq:i+1,id:i+1,created_at:0,kind:i%2?'assistant_message':'user_message',payload:{content:[{type:'text',text:'Message '+(i+1)+' — '+ '长会话滚动与手势验证。'.repeat(30)}]}}));
chat.entries.value=chat.entries.value.map((entry,i)=>i>=500&&i<1500?{...entry,kind:'assistant_message',payload:{content:[{type:'tool_call',id:'call-'+i,name:'shell_edit',arguments:{command:'echo '+i}}]}}:entry);
const active=ref(true), mobile=ref(true), session=ref('fixture'), dialog=ref('');
const groupMode=ref(false), groupMessages=ref(Array.from({length:5000},(_,i)=>({seq:i+101,at:0,author:{kind:'user'},text:'Group '+i+' '+ '群组长记录。'.repeat(i%20+1)})));
const realFetch=window.fetch.bind(window);
window.inspectionReads=0;
window.fetch=async (input,options)=>{
 const url=String(input);
 let value;
 const parsed=new URL(url,location.href);
 const generations=[{id:0,status:'Sealed',config:{model:'old'},compaction_cursor:0,source:null},{id:1,status:'Standby',config:{model:'new'},compaction_cursor:0,source:[2,10]},{id:2,status:'Active',config:{model:'new'},compaction_cursor:3,source:null}];
 if(parsed.pathname.endsWith('/generations')) value={items:generations,next:null};
 else if(parsed.pathname.endsWith('/structure')) {
  if(window.generationDelay) await new Promise(resolve=>setTimeout(resolve,window.generationDelay));
  const generation=generations[Number(parsed.pathname.split('/').at(-2))];
  const start=Number(parsed.searchParams.get('start')||0),kind=parsed.searchParams.get('kind'),origin=parsed.searchParams.get('origin');
  const all=Array.from({length:45},(_,i)=>({position:i,entry:{id:i+100,origin:i%2?'Input':'Model',recorded_at:0,model_call_id:null,message:{[i%2?'User':'Assistant']:{content:[{Text:{text:'# raw **text** generation '+generation.id+' item '+i}}]}}}}));
  const shown=all.filter(row=>row.position>=start&&(!kind||Object.keys(row.entry.message)[0]===kind)&&(!origin||row.entry.origin===origin)).slice(0,20);
  const after=(shown.at(-1)?.position??44)+1;
  value={generation,count:45,start,next:after<45?after:null,positions:shown.map(row=>row.position),items:shown.map(row=>row.entry)};
 }
 else if(url.endsWith('/context/inspect')) value={provider:'fixture',captured_at:0,request:{model:'fixture',conversation:Array.from({length:2000},(_,i)=>({System:{content:[{Text:{text:'Full system instructions '+i}}]}})),tools:[{name:'shell_start',description:'Run command',input_schema:{type:'object'}}]}};
 else if(url.endsWith('/history/query')) value={items:Array.from({length:50},(_,i)=>({record:{sequence:i+1},message_type:'System'})),next:null};
 else if(url.endsWith('/history/1')) {window.inspectionReads++;value=[{content:{value:{message:{System:{content:[{Text:{text:'Original system instructions'}}]}}}}}];}
 else return realFetch(input,options);
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
};
const executionMode=ref('Parallel');
const choices=Array.from({length:500},(_,i)=>({key:String(i),title:'Provider '+i,description:'Search provider or subscription'}));
createApp({setup(){provide(pageActivityKey,active);return()=>h(TooltipProvider, {}, {default:()=>h('main',{style:{height:'100vh',display:active.value?'flex':'none',flexDirection:'column'}},[groupMode.value?h(GroupLog,{groupId:'group-fixture',messages:groupMessages.value,loading:false,hasOlder:false}):h(ChatLog,{sessionId:session.value,mobile:mobile.value}),
 dialog.value==='generation'?h(GenerationInspector,{sessionId:'fixture',onClose:()=>dialog.value=''}):null,
 dialog.value==='inspect'?h(ContextInspector,{sessionId:'fixture',onClose:()=>dialog.value=''}):null,
 dialog.value==='execution'?h(Modal,{open:true,title:'工具执行方式',onClose:()=>dialog.value=''}, {default:()=>h(ToolExecutionRow,{modelValue:executionMode.value,'onUpdate:modelValue':value=>executionMode.value=value})}):null,
 dialog.value==='picker'?h(PickerDialog,{title:'添加搜索提供商',items:choices,placeholder:'搜索服务或订阅…',onClose:()=>dialog.value=''}, {'footer-start':()=>h('button',{class:'btn'},'自定义提供商')}):null,
 dialog.value==='album'?h(Modal,{open:true,title:'500 张图片',bodyScroll:'content',contentClass:'image-album-window',onClose:()=>dialog.value=''}, {default:()=>h('div',{class:'album-thumbnails modal-scroll-region'},[h(VirtualImageGrid,{count:500},{default:({start,limit})=>Array.from({length:limit-start},(_,i)=>h('div',{style:{aspectRatio:'4/3',background:'#888'}},'Image '+(start+i)))})])}):null,
 dialog.value==='activity'?h(Modal,{open:true,title:'1000 项活动',bodyScroll:'content',sheet:mobile.value,onClose:()=>dialog.value=''}, {default:()=>h(VirtualRows,{count:1000,class:'modal-scroll-region'}, {default:({index})=>h('div',{},'Activity '+index)})}):null
])});}}).use(createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]})).mount('#app');
window.fixture={chat,active,mobile,session,dialog,groupMode,groupMessages,executionMode};
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__chat_regression', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__chat_regression', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/sessions/ChatLog.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-chat-browser-'));
let chrome, ws;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  chrome = spawn(process.env.CHROME || '/usr/bin/google-chrome-stable', ['--headless=new','--no-first-run','--disable-extensions',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'], { stdio: 'ignore' });
  let debugPort;
  for(let n=0;n<100;n++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
  assert.ok(debugPort, 'Chrome must start');
  const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  ws = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(), exceptions=[];
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await js(expression))return;await sleep(100);}throw Error(label+' '+JSON.stringify({exceptions,dom:await js('document.body.innerHTML.slice(0,1500)'),fixture:await js('!!window.fixture')}));};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__chat_regression`});
  await until('!!window.fixture && !!document.querySelector(".chat-virtual-row")','transcript mounted');
  await sleep(700);
  const geometry=()=>js(`(()=>{const e=document.querySelector('.chatlog');return{top:e.scrollTop,height:e.scrollHeight,viewport:e.clientHeight,rows:document.querySelectorAll('.chat-virtual-row').length}})()`);
  let before=await geometry();assert.ok(before.height>before.viewport);assert.ok(before.rows<60,'transcript must stay virtualized');
  // Actual touch input travels through browser pointer handling and CSS touch-action.
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:300}]});
  for(let x=90;x<=145;x+=5){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:300}]});await sleep(17);}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);
  const transform=await js(`getComputedStyle(document.querySelector('.chatlog-content')).transform`);
  assert.match(transform, /44/, 'right swipe opens the rail');
  await js('fixture.active.value=false');await sleep(100);await js('fixture.active.value=true');await sleep(300);
  await until('document.querySelectorAll(".chat-virtual-row").length>0','reactivation restores rows without new messages');
  const beforeWheel=await geometry();
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:300,deltaX:0,deltaY:-500});await sleep(350);
  const after=await geometry();assert.ok(after.top<beforeWheel.top-100,'wheel escapes the tail after reactivation');
  await js(`fixture.chat.stream.value={...fixture.chat.stream.value,active:true,text:'New live output'};`);
  await sleep(200);
  const afterStream=await geometry();assert.ok(afterStream.top<afterStream.height-afterStream.viewport-100,'new output respects browsing history');
  // Resize repeatedly across the mobile/desktop boundary; no empty range or runaway DOM.
  for(const width of [700,1000,600,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});
    await js(`fixture.mobile.value=${width<700}`);await sleep(150);
    const g=await geometry();assert.ok(g.rows>0&&g.rows<80,'resizing retains a bounded visible range');
  }
  const railGaps=[];
  for(const width of [1000,1200,1600]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
    await js('fixture.mobile.value=false');await sleep(200);
    const g=await js(`(()=>{const words=document.querySelector('.chatlog-inner').getBoundingClientRect();const node=document.querySelector('.history-rail-node').getBoundingClientRect();return {gap:words.left-node.right,left:node.left,words:words.width};})()`);
    assert.ok(g.left>=0&&g.gap>=15,'desktop rail stays visible and clear of messages');
    railGaps.push(g.gap);
  }
  assert.ok(railGaps[2]>railGaps[0]+20,'wide desktop gives the rail more breathing room');
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  const railX=await js(`document.querySelector('.rail-clip').getBoundingClientRect().left+12`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:railX,y:300});
  await until(`document.querySelector('.rail-clip').style.getPropertyValue('--rail-proximity')==='1'`,'near rail fully visible');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:railX,y:650});await sleep(120);
  assert.equal(await js(`document.querySelector('.rail-clip').style.getPropertyValue('--rail-proximity')`),'1','vertical movement keeps the rail equally visible');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:railX+125,y:300});await sleep(120);
  const partial=await js(`Number(document.querySelector('.rail-clip').style.getPropertyValue('--rail-proximity'))`);
  assert.ok(partial>0&&partial<1,'horizontal distance fades gradually');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:railX+300,y:300});
  await until(`document.querySelector('.rail-clip').style.getPropertyValue('--rail-proximity')==='0'`,'far from rail hidden');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const textHits=await js(`(async()=>{
    const {glyphAt,selectionCovers}=await import('/src/ui/textAtPoint.ts');
    const el=document.createElement('div');
    el.style.cssText='position:fixed;left:100px;top:100px;width:240px;font:16px/48px monospace;white-space:pre;z-index:9999';
    el.textContent='first selected line\\nsecond selected line';
    document.body.append(el);
    const range=document.createRange();range.selectNodeContents(el.firstChild);
    const rects=[...range.getClientRects()].filter(r=>r.width>1);
    const x=rects[0].left+20,y=(rects[0].bottom+rects[1].top)/2;
    const result={gap:y>rects[0].bottom&&y<rects[1].top,selected:selectionCovers(range,x,y),glyph:!!glyphAt(x,y,el),blank:selectionCovers(range,rects[0].right+40,y)};
    el.remove();return result;
  })()`);
  assert.deepEqual(textHits,{gap:true,selected:true,glyph:true,blank:false},'line leading belongs to text, outer whitespace does not');
  const selectedGap=await js(`(()=>{
    for(const p of document.querySelectorAll('.message-context .markdown p')){
      const range=document.createRange();range.selectNodeContents(p);
      const rects=[...range.getClientRects()].filter(r=>r.width>1);
      for(let i=1;i<rects.length;i++){
        const a=rects[i-1],b=rects[i],y=(a.bottom+b.top)/2,x=Math.max(a.left,b.left)+10;
        if(b.top>a.bottom&&y>100&&y<700&&x<Math.min(a.right,b.right)){
          const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
          p.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',isPrimary:true,button:2,clientX:x,clientY:y}));
          p.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:x,clientY:y}));
          return true;
        }
      }
    }return false;
  })()`);
  assert.ok(selectedGap,'selected wrapped paragraph has a visible interline gap');
  await until(`!!document.querySelector('.menu-pop .menu-item-label')`,'selection context menu');
  assert.equal(await js(`document.querySelector('.menu-pop .menu-item-label').textContent`),'复制','interline right click acts on selection, not whole message');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await js('getSelection().removeAllRanges()');await sleep(200);
  const dialogs=[];
  for(const kind of ['picker','activity','album']){
    await js(`fixture.dialog.value='${kind}'`);
    for(const [width,height] of [[390,844],[390,380],[1100,400]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
      await js(`fixture.mobile.value=${width<900}`);await sleep(100);
      await until(`!!document.querySelector('.modal-card') && document.querySelector('.modal-card').getAnimations().every(a=>a.playState!=='running')`,'dialog animation settled');
      const layout=await js(`(()=>{const body=document.querySelector('.modal-body'),list=document.querySelector('${kind==='picker'?'.picker-list':'.virtual-rows'}');return {outer:body.scrollHeight-body.clientHeight,inner:list.scrollHeight-list.clientHeight,height:list.clientHeight,card:document.querySelector('.modal-card').getBoundingClientRect().toJSON()}})()`);
      assert.ok(layout.outer<=1,kind+' outer body must not also scroll: '+JSON.stringify(layout));
      assert.ok(layout.height>40&&layout.inner>0,kind+' inner viewport remains usable');
      assert.ok(layout.card.bottom<=height+1,kind+' dialog fits viewport '+JSON.stringify({width,height,layout}));
      await js(`(()=>{const list=document.querySelector('${kind==='picker'?'.picker-list':'.virtual-rows'}');list.scrollTop=list.scrollHeight;})()`);await sleep(100);
      assert.ok(await js(`(()=>{const list=document.querySelector('${kind==='picker'?'.picker-list':'.virtual-rows'}');return list.scrollTop>0})()`),'inner list can reach later records');
      dialogs.push({kind,width,height,outer:layout.outer,innerHeight:layout.height});
    }
    await js(`fixture.dialog.value=''`);await sleep(350);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await js(`fixture.mobile.value=true;fixture.dialog.value='picker'`);
  await until(`!!document.querySelector('.picker-dialog.modal-page')`,'full-screen local picker');
  const url=await js('location.href');
  await js('history.back()');
  await until(`fixture.dialog.value===''`,'Back closes the full-screen local picker');
  assert.equal(await js('location.href'),url,'Back leaves the underlying page unchanged');
  await js(`fixture.dialog.value='execution'`);
  await until(`!!document.querySelector('.choice-capsule')`,'tool execution setting mounted');
  await js(`document.querySelector('.choice-capsule [value="Serial"]').click()`);
  await until(`fixture.executionMode.value==='Serial'`,'serial mode selected');
  await js(`document.querySelector('.choice-capsule [value="Parallel"]').click()`);
  await until(`fixture.executionMode.value==='Parallel'`,'parallel mode selected');
  await js(`fixture.dialog.value=''`);await sleep(350);
  await js(`fixture.dialog.value='generation'`);
  await until(`document.querySelectorAll('.generation-entry').length>0`,'generation loads');
  assert.ok(await js(`document.querySelectorAll('.generation-entry').length<20`),'generation DOM is virtualized');
  assert.ok(await js(`document.querySelector('.generation-filters [aria-label="Generation"]').textContent.includes('#2')`),'defaults to current');
  assert.ok(await js(`!!document.querySelector('.generation-entry[data-role="Tools"]')`),'tools lead generation');
  assert.equal(await js(`!!document.querySelector('.generation-filters select')`),false,'no native selects');
  const chooseGenerationOption=async(label,value)=>{
    await until(`!document.querySelector('.generation-filters [aria-label="${label}"]').disabled`,'picker ready');
    const point=await js(`(()=>{const r=document.querySelector('.generation-filters [aria-label="${label}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    await until(`!!document.querySelector('.control-select-option[data-value="${value}"]')`,'styled options');
    const option=await js(`(()=>{const el=document.querySelector('.control-select-option[data-value="${value}"]');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...option});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...option,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...option,button:'left',clickCount:1});
  };
  await chooseGenerationOption('消息类型','User');
  await until(`document.querySelectorAll('.generation-entry[data-role="User"]').length>0&&!document.querySelector('.generation-entry[data-role="Tools"]')&&!document.querySelector('.generation-refresh').disabled`,'type filter');
  assert.ok(await js(`document.querySelector('.generation-entry pre').textContent.includes('# raw **text** generation 2')`),'raw text preserved');
  await js(`document.querySelector('.generation-cards').scrollTop=100000`);
  await until(`document.querySelector('.generation-load-status').textContent.includes('已全部加载')`,'scroll loads filtered remainder');
  assert.ok(await js(`document.querySelectorAll('.generation-entry').length<20`),'appended records stay virtual');
  const generationOffset=await js(`document.querySelector('.generation-cards').scrollTop`);
  await js(`window.generationDelay=150;document.querySelector('.generation-refresh').click()`);
  assert.ok(await js(`document.querySelectorAll('.generation-entry').length>0`),'refresh keeps cards mounted');
  await until(`!document.querySelector('.generation-refresh').disabled`,'refresh complete');
  assert.ok(Math.abs(await js(`document.querySelector('.generation-cards').scrollTop`)-generationOffset)<4,'refresh preserves scroll');
  await js(`window.generationDelay=0`);
  await chooseGenerationOption('Generation','0');
  await until(`document.querySelector('.generation-entry pre')?.textContent.includes('generation 0')`,'historical switch');
  await js(`document.querySelector('.generation-entry footer button').click()`);
  await until(`!!document.querySelector('.generation-full-text')`,'full detail');
  await js('history.back()');
  await until(`!document.querySelector('.generation-full-text')`,'Back closes detail');
  assert.equal(await js('fixture.dialog.value'),'generation');
  await js(`fixture.dialog.value=''`);await sleep(350);
  await js(`fixture.dialog.value='inspect'`);
  await until(`document.querySelectorAll('.context-inspector .inspection-row').length>0`,'context loaded');
  assert.ok(await js(`document.querySelectorAll('.context-inspector .inspection-row').length<30`),'context rows virtualized');
  await js(`document.querySelector('.context-inspector .inspection-row').click()`);
  await until(`document.querySelector('.inspection-json')?.textContent==='Full system instructions 0'`,'full readable system text');
  await js('history.back()');
  await until(`!document.querySelector('.inspection-json')`,'Back closes detail first');
  assert.equal(await js('fixture.dialog.value'),'inspect');
  await js(`document.querySelectorAll('.inspection-tabs button')[1].click()`);
  await until(`document.querySelector('.inspection-row')?.textContent.includes('shell_start')`,'tool definitions');
  await js(`document.querySelectorAll('.inspection-tabs button')[3].click()`);
  await until(`document.querySelector('.inspection-row')?.textContent.includes('#1')`,'history page');
  assert.equal(await js('window.inspectionReads'),0,'history details loaded on demand');
  await js(`document.querySelector('.inspection-row').click()`);
  await until(`document.querySelector('.inspection-json')?.textContent.includes('Original system instructions')`,'raw history record');
  assert.equal(await js('window.inspectionReads'),1);
  await js(`fixture.dialog.value=''`);await sleep(350);
  // Activity windows belong to the session, not to whichever virtual row currently hosts a chip.
  await js(`fixture.chat.entries.value=[{seq:1,id:1,kind:'assistant_message',payload:{content:[{type:'tool_call',id:'activity-call',name:'shell',arguments:{command:'printf test'}}]}}]`);
  await until('document.querySelectorAll(".history-rail-node").length===1','single activity');
  await js(`document.querySelector('.history-rail-node').click()`);
  await until('!!document.querySelector(".process-detail")','activity detail opens');
  await js(`window.activityDialogElement=document.querySelector('.process-detail');fixture.chat.entries.value=[...fixture.chat.entries.value,{seq:2,id:2,kind:'assistant_message',payload:{content:[{type:'text',text:'Reply moves the tool into a different row'}]}}]`);
  await sleep(150);
  assert.ok(await js(`window.activityDialogElement===document.querySelector('.process-detail')`),'regrouping preserves the actual dialog instance');
  await js(`fixture.chat.entries.value=[...fixture.chat.entries.value,...Array.from({length:200},(_,i)=>({seq:i+3,id:i+3,kind:'user_message',payload:{content:[{type:'text',text:'Virtual row '+i+' long content '.repeat(100)}]}}))];document.querySelector('.chatlog').scrollTop=9999999`);
  await sleep(300);
  assert.ok(await js(`window.activityDialogElement===document.querySelector('.process-detail')`),'virtual row recycling cannot replace the dialog');
  for(let cycle=0;cycle<8;cycle++) {
    if(cycle) {await js(`document.querySelector('.history-rail-node').click()`);await until('!!document.querySelector(".process-detail")','reopen activity');}
    await js(`document.querySelector('.process-detail-heading button:last-child').click()`);
    await until('!document.querySelector(".modal-card,.modal-overlay")','activity layers removed');
    assert.notEqual(await js('document.body.style.pointerEvents'),'none','no page pointer lock after close');
    assert.equal(await js('document.querySelectorAll(".activity-dialog-host .history-chip-host").length'),0,'closed activity host is released');
  }
  // Output updates are data, never an instruction to reopen a closed activity.
  await js(`window.savedActivityEntries=fixture.chat.entries.value;fixture.chat.entries.value=[]`);
  await sleep(80);
  await js(`fixture.chat.entries.value=window.savedActivityEntries`);
  await sleep(150);
  assert.equal(await js('document.querySelectorAll(".process-detail,.modal-overlay").length'),0,'stream replacement cannot reopen a closed detail');
  await js(`document.querySelector('.history-rail-node').click()`);
  await until('!!document.querySelector(".process-detail")','detail before transient removal');
  await js(`fixture.chat.entries.value=[]`);
  await sleep(80);
  await js(`fixture.chat.entries.value=window.savedActivityEntries`);
  await sleep(150);
  assert.equal(await js('document.querySelectorAll(".process-detail,.modal-overlay").length'),0,'an old open intent cannot replay when streaming restores a chip');
  await js('fixture.chat.pendingSeq.value=1');
  await until('!!document.querySelector(".process-detail")','search opens an offscreen activity');
  await sleep(300);
  assert.ok(await js('!!document.querySelector(".process-detail")'),'search clearing its temporary locate state does not dismiss the activity');
  await js(`document.querySelector('.process-detail-heading button:last-child').click()`);
  await until('!document.querySelector(".modal-card,.modal-overlay")','search activity closes');
  await js(`document.querySelector('.history-rail-node').click()`);
  await until('!!document.querySelector(".process-detail")','activity before session switch');
  await js(`fixture.session.value='another-session'`);
  await until('!document.querySelector(".modal-card,.modal-overlay")','session switch disposes its activity windows');
  assert.notEqual(await js('document.body.style.pointerEvents'),'none');
  await js('fixture.groupMode.value=true');
  await until('document.querySelectorAll(".group-virtual-row").length>0','group virtual rows');
  await sleep(700);
  assert.ok(await js('document.querySelectorAll(".group-virtual-row").length<60'),'5000 group messages have bounded DOM');
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:300,deltaX:0,deltaY:-600});await sleep(400);
  const anchor=()=>js(`(()=>{const e=document.querySelector('.chatlog');const row=[...document.querySelectorAll('.group-virtual-row')].find(r=>r.getBoundingClientRect().bottom>e.getBoundingClientRect().top);return {text:row.textContent,y:row.getBoundingClientRect().top,top:e.scrollTop,height:e.scrollHeight,viewport:e.clientHeight}})()`);
  const groupBefore=await anchor();
  await js(`fixture.groupMessages.value=[...Array.from({length:100},(_,i)=>({seq:i+1,at:0,author:{kind:'user'},text:'Older '+i})),...fixture.groupMessages.value]`);
  await sleep(500);const groupAfter=await anchor();
  assert.equal(groupAfter.text,groupBefore.text,'prepend preserves visible group message');
  assert.ok(Math.abs(groupAfter.y-groupBefore.y)<5,'prepend preserves group pixel offset '+JSON.stringify({groupBefore,groupAfter}));
  await js(`fixture.groupMessages.value=[...fixture.groupMessages.value,{seq:5200,at:0,author:{kind:'user'},text:'New group message'}]`);
  await sleep(300);const groupAppended=await anchor();
  assert.equal(groupAppended.text,groupAfter.text,'new group messages preserve history browsing');
  await js('fixture.active.value=false');await sleep(100);await js('fixture.active.value=true');await sleep(400);
  assert.ok(await js('document.querySelectorAll(".group-virtual-row").length>0'),'group reactivation restores virtual rows');
  for (const width of [1000,600,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});await sleep(250);
    assert.ok(await js('document.querySelectorAll(".group-virtual-row").length>0 && document.querySelectorAll(".group-virtual-row").length<80'),'resized group stays virtualized');
  }
  console.log(JSON.stringify({groupRows:5000,groupBefore,groupAfter,dialogs}));
  assert.deepEqual(exceptions,[],'no browser runtime exceptions');
  await js(`fixture.groupMode.value=false; fixture.chat.entries.value=[{seq:1,id:1,kind:'system_message',payload:{content:[],instruction_sections:[{kind:'base',content:'Base instructions'},{kind:'mcp',content:'MCP instructions'},{kind:'skills',content:'Skills instructions',supplemental:true},{kind:'sessions-groups',content:'Session instructions'}]}},{seq:2,id:2,kind:'assistant_message',payload:{content:[{type:'text',text:'Reply '.repeat(200)}]}}]`);
  await until(`!!document.querySelector('button[aria-label="技能使用指令"]')`,'independent instruction node');
  await js(`document.querySelector('button[aria-label="技能使用指令"]').click()`);
  await until(`document.querySelector('.system-detail .detail-pre')?.textContent==='Skills instructions'`,'instruction opens its own text directly');
  assert.ok(await js(`!document.querySelector('.instruction-note')`),'instruction body has no supplemental banner');
  assert.ok(await js(`!document.querySelector('.context-inspector')`),'timeline does not route into the history inspector');
  await js('history.back()');
  await until(`!document.querySelector('.system-detail')`,'Back closes instruction');
  assert.deepEqual(await js('window.fixtureErrors'),[],'no layout observer errors');
  console.log(JSON.stringify({ok:true,entries:2000,toolCalls:1000,before,beforeWheel,after,transform}));
} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
