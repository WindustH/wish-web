import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';
const html = `<html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">
import {createApp,h,ref,provide} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import {TooltipProvider} from 'reka-ui';
import {configDraftKey} from '/src/features/settings/useConfigDraft.ts';
import AccountEditor from '/src/features/settings/AccountEditor.vue';
import AccountServicesPreview from '/src/features/debug/AccountServicesPreview.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/styles/features.css';
const draft=ref({accounts:{demo:{name:'Sample account',preset:'example',api_key:'local-fixture',credentials:{},credentials_env:{},proxy_enabled:true}},providers:{},search:{order:[],providers:{}},fetch:{order:[],providers:{}},defaults:{provider:'keep',model:'keep'}});
window.draft=draft;const editor=ref(true),suggest=ref(true);window.reopen=()=>{suggest.value=false;editor.value=true};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]});
createApp({setup(){
provide(configDraftKey,{draft,saveConfig:async()=>{throw Error('Must not save from confirmation')},load:async()=>{},
catalog:ref({presets:[]}),searchCatalog:ref([{id:'search',name:'Example search',key:'borrowed',borrows_from:['example']}]),
fetchCatalog:ref([{id:'reader',name:'Example reader',key:'required',account_preset:'example'}]),
imageCatalog:ref([]),mediaCatalog:ref([])});
window.fixture=true;
return ()=>h(TooltipProvider,{},()=>[editor.value?h(AccountEditor,{id:'demo',suggestServices:suggest.value,onClose:()=>editor.value=false}):null,h(AccountServicesPreview)]);
}}).use(router).mount('#app');
</script></html>`;
await browserFixture(html, async ({send,js,until,click}) => {
  await until('!!document.querySelector(".account-editor .primary")','new account editor');
  await click('.account-editor .primary');
  await until('document.querySelectorAll(".service-option").length===2','compatible services offered after Done');
  assert.equal(await js('Object.keys(draft.value.search.providers).length'),0,'prompt does not add automatically');
  await click('.service-option:last-child input');
  await click('[role=dialog]:has(.account-services-dialog) .primary');
  await until('!document.querySelector(".account-services-dialog")','confirmation closes');
  assert.equal(await js('draft.value.search.providers.search.credential_id'),'demo');
  assert.equal(await js('Object.keys(draft.value.fetch.providers).length'),0,'unchecked service is not added');
  assert.equal(await js('draft.value.defaults.provider'),'keep');
  await js('reopen()');
  await until('!!document.querySelector(".account-editor .primary")','existing editor');
  await click('.account-editor .primary');
  await until('!document.querySelector(".account-editor")','existing editor closes without suggestion');
  assert.equal(await js('!!document.querySelector(".account-services-dialog")'),false);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await js('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("打开账户服务")||e.textContent.includes("Open account services")).click()');
  await until('document.querySelectorAll(".service-option").length===5','preview uses real dialog');
  assert.equal(await js('(()=>{const r=document.querySelector("[role=dialog]").getBoundingClientRect();return r.width<=390&&r.left>=0})()'),true,'mobile dialog fits');
  await js('(async()=>{for(const e of document.querySelectorAll(".service-option input")){e.click();await Promise.resolve();}})()');
  assert.equal(await js('document.querySelector("[role=dialog] .primary").disabled'),true,'empty selection cannot submit');
  await js('document.querySelector(".service-option input").click()');
  await click('[role=dialog] .primary');
  await until('!!document.querySelector("[role=status]")','preview shows local result');
  assert.equal(await js('Object.keys(draft.value.search.providers).length'),1,'preview never changes draft');
});
console.log('Account service confirmation and preview passed.');
