import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';

const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import {TooltipProvider} from 'reka-ui';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {sessions} from '/src/core/state/sessionsSlice.ts';
import SessionList from '/src/features/sessions/SessionList.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';
import '/src/styles/components.css';import '/src/styles/features.css';
registerBrowserPlatform({namespace:'session-list-mount-test',version:1});
const data={rows:[]};
window.fetch=async input=>new Response(JSON.stringify(String(input).includes('/folders')?[]:{items:data.rows,next:null}),{headers:{'Content-Type':'application/json'}});
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});
await router.push('/');
const mounted=ref(true),errors=[];
const app=createApp({render:()=>h(TooltipProvider,{},()=>h('div',{style:'width:320px;height:700px;display:flex'},mounted.value?[h(SessionList)]:[]))});
app.config.errorHandler=error=>errors.push(String(error));
app.use(router).mount('#app');
window.fixture={sessions,mounted,errors,data};
</script></body></html>`;

await browserFixture(html, async ({ js, until, send }) => {
  assert.deepEqual(await js('fixture.errors'), [], 'empty list mounts without eager computed initialization errors');
  await until('!!document.querySelector(".sessions-pane") && !fixture.sessions.loading.value', 'empty list mounts');
  await js(`fixture.data.rows=['first','second','third'].map(id=>({
    kind:'session',parent:null,pinned:false,session:{id,name:id,updated_at:Date.now()},
    status:{running:false,phase:'Idle',config:{model:'fixture'},metadata:{}},revision:1
  }));fixture.sessions.refresh()`);
  await until('document.querySelectorAll(".sl-item").length===3', 'loaded sessions render');
  await js(`document.querySelector('[data-session-id="first"] .sl-row').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true,button:0}))`);
  await until('document.querySelectorAll(".sl-item.chosen").length===1', 'shift-click selects a session');
  await js('fixture.data.rows=fixture.data.rows.filter(row=>row.session.id!=="first");fixture.sessions.refresh()');
  await until('document.querySelectorAll(".sl-item").length===2 && !document.querySelector(".sl-item.chosen")', 'removed rows leave the selection');
  await js(`document.querySelector('[data-session-id="second"] .sl-row').click()`);
  await until('document.querySelectorAll(".sl-item.chosen").length===1', 'selection remains usable after pruning');
  await js('document.querySelector(".sl-heading button").click()');
  await until('!document.querySelector(".sl-item")', 'folded section hides rows');
  await js('document.querySelector(".sl-heading button").click()');
  await until('document.querySelectorAll(".sl-item").length===2 && !document.querySelector(".sl-item.chosen")', 'folded rows are no longer selected');
  await js('fixture.mounted.value=false');
  await until('!document.querySelector(".sessions-pane")', 'list unmounts');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await js('fixture.mounted.value=true');
  await until('document.querySelectorAll(".sl-item").length===2', 'populated mobile list remounts');
  assert.deepEqual(await js('fixture.errors'), []);
  console.log('Session list: empty and populated mount, selection pruning, folding and mobile remount passed');
});
