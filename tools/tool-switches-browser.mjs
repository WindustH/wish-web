// Tool delivery controls: dependent Task state and desktop/mobile layout.
// Run: node tools/tool-switches-browser.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';
import {TooltipProvider} from 'reka-ui';
import ToolSwitchRows from '/src/features/settings/ToolSwitchRows.vue';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';import '/src/features/settings/settings.css';
const tools=ref({shell:true,task_delivery:'command',history_search:true,history_search_delivery:'command',web_fetch:true,web_search:true,ask_user:true,mcp:true,skills:true,sessions:true});
window.fixture={tools};
createApp({render:()=>h(TooltipProvider,{},()=>h('div',{class:'settings'},h(ToolSwitchRows,{modelValue:tools.value,'onUpdate:modelValue':value=>tools.value=value,searchAvailable:true})))}).mount('#app');
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), plugins: [vue(), {
  name: 'chat-regression', configureServer(server) { server.middlewares.use('/__tool_switches', async (_, res) => {
    res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/__tool_switches', html));
  }); },
}], server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['src/features/settings/ToolSwitchRows.vue'], include: ['vue', '@mdit/plugin-tex', '@tanstack/vue-virtual', 'dompurify', 'markdown-it', 'motion-v', 'reka-ui', 'temml', 'vue-router'] } });
const profile = await mkdtemp(join(tmpdir(), 'wish-tool-switches-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/__tool_switches`});
  await until('!!window.fixture && document.querySelectorAll(".tool-delivery").length===5','controls mounted');
  const task=`document.querySelector('[aria-label="Task 提供方式"], [aria-label="Task delivery"]')`;
  assert.equal(await js(task+'.querySelectorAll("input").length'),3);
  assert.equal(await js(task+`.querySelector('input[value="off"]').disabled`),true);
  await js(task+`.querySelector('input[value="tool"]').click()`);
  await until('fixture.tools.value.task_delivery==="tool"','task selects direct tool');
  await js('fixture.tools.value.shell=false');
  await until(task+`.querySelector('input[value="off"]').checked`,'shell off selects Task off');
  assert.equal(await js(task+'.querySelectorAll("input:disabled").length'),3);
  await js('fixture.tools.value.shell=true');
  await until(task+`.querySelector('input[value="tool"]').checked`,'shell on restores task delivery');
  for (const width of [390,1200]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width===390});await sleep(100);
    assert.ok(await js(`Array.from(document.querySelectorAll('.capability-row')).every(row=>{
      const r=row.getBoundingClientRect(), c=row.querySelector('.tool-delivery').getBoundingClientRect();
      return Math.abs(r.right-parseFloat(getComputedStyle(row).paddingRight)-c.right)<2;
    })`),'controls align to the right at '+width);
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow');
  }
  assert.ok(await js(`Array.from(document.querySelectorAll('.segment.danger')).every(label=>getComputedStyle(label).color==='rgb(232, 133, 123)')`),'off icons use danger red');
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({ok:true,checks:['Task three states','Shell follows and restores','right alignment','red off icons']}));

} finally {
  ws?.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(2000)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
