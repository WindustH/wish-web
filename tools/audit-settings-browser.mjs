import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';

const html=String.raw`<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import {TooltipProvider} from 'reka-ui';
import Editor from '/src/features/settings/KeyValueEditor.vue';
import Mcp from '/src/features/settings/McpServer.vue';
import {saveConfigEdits} from '/src/core/configEdits.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'audit-settings',version:1});
const value=ref({TOKEN:'<redacted>',NAME:'old'}),mcp=ref({enabled:true,transport:'stdio',command:'node',args:['old'],cwd:null,scope:'session',env:{}});
window.saves=[];
window.fetch=async(input,options={})=>{
 let data,status=200;
 if(options.method==='PUT'){
  const body=JSON.parse(options.body);window.saves.push(body);
  if(saves.length===1){status=409;data={error:{message:'revision changed'}};}
  else data={revision:'saved',config:body.config};
 }else data={revision:'new',config:{accounts:{a:{api_key:'new-token'}},usage:{stream_sample_limit:20000},untouched:true}};
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
};
createApp({render:()=>h(TooltipProvider,{},()=>[
 h('section',{id:'editor'},[h(Editor,{modelValue:value.value,secretValues:true,namePlaceholder:'Name',valuePlaceholder:'Value',addLabel:'Add','onUpdate:modelValue':v=>value.value=v})]),
 h(Mcp,{id:'fixture',value:mcp.value,providers:[],initiallyOpen:true})
])}).mount('#app');window.fixture={value,mcp,saveConfigEdits};
</script></body></html>`;

await browserFixture(html,async({js,until})=>{
 await until('document.querySelectorAll("#editor .kv-row").length===2','key/value rows');
 assert.equal(await js('document.querySelector("#editor .kv-row input[type=password]").value'),'','stored secret remains masked');
 await js('document.querySelector("#editor .kv-add").click()');
 await until('document.querySelectorAll("#editor .kv-row").length===3','empty row survives own emitted state');
 await js('fixture.value.value={RESET:"new"}');
 await until('document.querySelectorAll("#editor .kv-row").length===1','external reset updates rows');
 assert.deepEqual(await js('[...document.querySelectorAll("#editor input")].map(i=>i.value)'),['RESET','new']);
 await js('fixture.value.value=undefined');
 await until('document.querySelectorAll("#editor .kv-row").length===0','clearing configuration removes rows');
 await until('!!document.querySelector("textarea")','MCP arguments field');
 await js(String.raw`(()=>{const input=document.querySelector('textarea');input.focus();input.value='--new\nvalue\n';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 assert.deepEqual(await js('[...fixture.mcp.value.args]'),['--new','value'],'draft updates before blur');
 assert.equal(await js('document.querySelector("textarea").value'),'--new\nvalue\n','trailing newline remains editable');
 const saved=await js(`fixture.saveConfigEdits({revision:'old',config:{accounts:{a:{api_key:'old-token'}},usage:{stream_sample_limit:20000},untouched:true}}, {accounts:{a:{api_key:'old-token'}},usage:{stream_sample_limit:500},untouched:true})`);
 assert.equal(saved.config.accounts.a.api_key,'new-token','conflict retry preserves refreshed credentials');
 assert.equal(saved.config.usage.stream_sample_limit,500,'local usage setting is reapplied');
 assert.equal(await js('saves.length'),2);
 console.log('Settings: external reset, secret masking, blank rows, unblurred MCP edits and conflict-safe config saves passed');
});
