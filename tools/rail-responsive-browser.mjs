// Exercise the real transcript at a fixed desktop viewport while its pane is resized.
import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const html = `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';
import {TooltipProvider} from 'reka-ui';
import {createRouter,createMemoryHistory} from 'vue-router';
import ChatLog from '/src/features/sessions/ChatLog.vue';
import {chat} from '/src/core/state/chatSlice.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {applyTokens} from '/src/ui/applyTokens.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/layout.css';
import '/src/styles/components.css';import '/src/styles/features.css';
registerBrowserPlatform({namespace:'rail-responsive',version:1});applyTokens();
chat.sessionId.value='fixture';chat.loadingInitial.value=false;
chat.entries.value=Array.from({length:120},(_,index)=>[
 {seq:index*3+1,kind:'user_message',payload:{content:[{type:'text',text:'Prompt '+index}]}},
 {seq:index*3+2,kind:'assistant_message',payload:{content:[{type:'tool_call',id:'call-'+index,name:'shell',arguments:{command:'echo '+index}}]}},
 {seq:index*3+3,kind:'assistant_message',payload:{content:[{type:'text',text:'Answer '+index+' — '+'Keep the conversation readable while its sidebar is resized. '.repeat(8)}]}},
].map(entry=>({...entry,id:entry.seq,created_at:0}))).flat();
const width=ref(0),mobile=ref(false);
createApp({setup(){return()=>h(TooltipProvider,{},()=>h('main',{style:{height:'100dvh',width:width.value?width.value+'px':'100%',display:'flex',flexDirection:'column'}},[h(ChatLog,{sessionId:'fixture',mobile:mobile.value})]));}})
 .use(createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]})).mount('#app');
window.fixture={width,mobile};
</script></body></html>`;

await browserFixture(html, async ({ js, until, click, send }) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 850, deviceScaleFactor: 1, mobile: false });
  await until('!!document.querySelector(".history-rail-node")', 'timeline mounts');
  await until('!document.querySelector(".chatlog-wrap").classList.contains("rail-drawer")', 'wide pane floats the timeline');
  assert.equal(await js('document.querySelector(".rail-clip").hasAttribute("aria-hidden")'), false);
  const narrow = async (width) => {
    await js(`fixture.width.value=${width}`);
    await until('document.querySelector(".chatlog-wrap").classList.contains("rail-drawer")', 'pane width collapses the timeline');
  };
  const open = () => js('document.querySelector(".rail-drawer-toggle").getAttribute("aria-expanded")==="true"');
  const geometry = () => js(`(()=>{const inner=document.querySelector('.chatlog-inner'),scroll=document.querySelector('.chatlog');return {width:inner.offsetWidth,left:inner.getBoundingClientRect().left,padding:getComputedStyle(scroll).paddingLeft,rows:document.querySelectorAll('.chat-virtual-row').length};})()`);
  await narrow(620);
  assert.equal(await js('innerWidth'), 1400, 'the desktop viewport did not change');
  assert.equal(await open(), false);
  assert.equal(await js('document.querySelector(".rail-clip").getAttribute("aria-hidden")'), 'true');
  const closed = await geometry();
  assert.equal(closed.padding, '24px', 'collapsed timeline no longer reserves a 40px lane');
  await click('.rail-drawer-toggle');
  await until('document.querySelector(".rail-drawer-toggle").getAttribute("aria-expanded")==="true"', 'mouse opens the drawer');
  await sleep(250);
  const expanded = await geometry();
  assert.equal(expanded.width, closed.width, 'opening does not rewrap the transcript');
  assert.ok(Math.abs(expanded.left - closed.left - 44) < 1, 'desktop reuses the mobile reveal');
  for (const width of [640, 600, 620]) {
    await narrow(width);
    await sleep(100);
    assert.equal(await open(), true, 'measurements ignore the drawer translation');
  }
  await click('.rail-drawer-toggle');
  await sleep(250);
  const point = await js(`(()=>{for(const p of document.querySelectorAll('.message-context .markdown p')){const b=p.getBoundingClientRect();if(b.top>50&&b.top<650&&b.width>180)return {x:b.left+8,y:b.top+12};}throw Error('No visible paragraph');})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: point.x + 130, y: point.y });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: point.x + 130, y: point.y });
  assert.equal(await open(), false, 'mouse text selection does not reveal the timeline');
  assert.ok(await js('getSelection().toString().length>0'), 'native text selection remains usable');
  await js('getSelection().removeAllRanges();document.querySelector(".rail-drawer-toggle").focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until('document.querySelector(".rail-drawer-toggle").getAttribute("aria-expanded")==="true"', 'keyboard opens the drawer');
  await js('fixture.width.value=0');
  await until('!document.querySelector(".chatlog-wrap").classList.contains("rail-drawer")', 'wide pane restores the floating timeline');
  assert.equal(await js('!!document.querySelector(".rail-drawer-toggle")'), false);
  assert.equal(await js('new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".chatlog-content")).transform).m41'), 0);
  await narrow(620);
  assert.equal(await open(), false, 'crowding the pane again starts closed');
  assert.ok((await geometry()).rows > 0 && (await geometry()).rows < 80, 'resizing preserves virtualization');
  await js('fixture.width.value=0;fixture.mobile.value=true');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await sleep(200);
  assert.equal(await js('!!document.querySelector(".rail-drawer-toggle")'), false, 'phone keeps the swipe interaction');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 300 }] });
  for (const x of [95, 110, 130]) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 300 }] });
    await sleep(20);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until('document.querySelector(".chatlog-wrap").classList.contains("rail-out")', 'phone swipe still reveals the timeline');
  console.log('Responsive timeline: container width, desktop toggle, stable reveal, mouse selection, keyboard, resize cleanup and phone swipe passed');
});
