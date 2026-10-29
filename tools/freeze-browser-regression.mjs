// Cached route interaction after model/reasoning picker closure; no live backend.
// Run: node tools/freeze-browser-regression.mjs (CHROME may override the executable).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const html = `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>.route-page{height:100dvh}.sessions-split,.content-pane{height:100%;width:100%}.sessions-pane{display:none}</style><body><div id="app"></div><script type="module">
import {createApp,h,ref,KeepAlive} from 'vue';
import {createRouter,createMemoryHistory,RouterView,useRoute} from 'vue-router';
import {TooltipProvider} from 'reka-ui';
import Modal from '/src/ui/components/Modal.vue';
import CachedPage from '/src/ui/components/CachedPage.vue';
import ReasoningSettings from '/src/features/sessions/ReasoningSettings.vue';
import {useMobileNavigationMotion} from '/src/features/shell/useMobileNavigationMotion.ts';
import {useRecentsSheet} from '/src/features/sessions/useRecentsSheet.ts';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'wish-freeze',version:1});
window.fetch=async()=>new Response(JSON.stringify({providers:[{id:'fixture',preset:'custom',enabled:true,model_catalog_available:false,reasoning_efforts:{low:1,high:2,max:3},models:{fixture:{supports_reasoning:true}}}]}),{headers:{'Content-Type':'application/json'}});
const choice=ref({provider:'fixture',model:'fixture',reasoning_effort:'high'});
const Chat={setup(){const opened=ref(false);return()=>h('div',{class:'chat'},[h('button',{id:'open',onClick:()=>opened.value=true},'Effort'),opened.value?h(ReasoningSettings,{selection:choice.value,onSelect:v=>choice.value=v,onClose:()=>opened.value=false}):null]);}};
const Home={render:()=>h('div',{class:'home-scroll',style:'height:100%;overflow:auto'},Array.from({length:30},(_,index)=>h('button',{id:index===0?'home':undefined,style:'display:block;height:64px;width:100%'},'Session '+index)))};
const Shell={setup(){const split=ref(null);useRecentsSheet(split);return()=>h('div',{ref:split,class:'sessions-split'},[h('div',{id:'session-list',class:'sessions-pane sheet-closed'},[h('div',{class:'sl-scroll'},'List')]),h('div',{class:'content-pane'},[h(RouterView)])]);}};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Shell,meta:{section:'sessions'},children:[{path:'sessions',name:'sessions',component:Home},{path:'sessions/all',name:'all-sessions',component:Home},{path:'s/fixture',name:'session',component:Chat}]}]});
const other=ref(false);window.fixture={go:path=>router.push(path),choice,other};
await router.push('/s/fixture');await router.isReady();
createApp({setup(){useMobileNavigationMotion();return()=>h(TooltipProvider,{},()=>h('div',{class:'main-col',style:'height:100dvh'},[other.value?h(Modal,{open:true,title:'Independent dialog',onClose:()=>other.value=false},()=>h('button',{id:'other-close',onClick:()=>other.value=false},'Close')):null,h(RouterView,{}, {default:({Component,route})=>h(KeepAlive,{},()=>h(CachedPage,{view:Component,route,key:route.matched[0].path}))})]));}}).use(router).mount('#app');
await router.push('/s/fixture');
</script></body></html>
`;
const server = await createServer({
  configFile: false,
  define: { __WEB_BUILD_ID__: JSON.stringify('regression-build') },
  root: process.cwd(),
  plugins: [
    vue(),
    {
      name: 'picker-close-regression',
      configureServer(server) {
        server.middlewares.use('/__picker_close_regression', async (_, res) => {
          res.setHeader('content-type', 'text/html');
          res.end(await server.transformIndexHtml('/__picker_close_regression', html));
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0 },
  optimizeDeps: { entries: ['src/features/sessions/useRecentsSheet.ts'], include: ['vue', 'motion-v', 'vue-router'] },
});
const profile = await mkdtemp(join(tmpdir(), 'wish-picker-close-'));
let chrome, ws;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  chrome = spawn(
    process.env.CHROME || '/usr/bin/google-chrome-stable',
    [
      '--headless=new',
      '--no-first-run',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let debugPort;
  for (let n = 0; n < 100; n++) {
    try {
      debugPort = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      break;
    } catch {
      await sleep(100);
    }
  }
  assert.ok(debugPort, 'Chrome must start');
  const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  ws = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map(),
    exceptions = [];
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown')
      exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const js = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async (expression, label) => {
    for (let n = 0; n < 100; n++) {
      if (await js(expression)) return;
      await sleep(100);
    }
    throw Error(
      label +
        ' ' +
        JSON.stringify({
          exceptions,
          dom: await js('document.body.innerHTML.slice(0,1500)'),
          fixture: await js('!!window.fixture'),
        }),
    );
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/__picker_close_regression` });
  await until('!!document.querySelector("#open")', 'chat mounted');
  const openPicker = async () => {
    await js('document.querySelector("#open").click()');
    await until(`!!document.querySelector('[data-choice-key="effort:max"]')`, 'picker mounted');
    await until(`!document.querySelector('.picker input').disabled`, 'metadata ready');
  };
  for (let n = 0; n < 6; n++) {
    await openPicker();
    assert.equal(
      await js('document.body.style.pointerEvents'),
      '',
      'picker must not change document-wide pointer state',
    );
    assert.ok(
      await js("document.elementFromPoint(12,700)?.closest('.modal-overlay')!==null"),
      'picker overlay intercepts background taps',
    );
    await js(`document.querySelector('[data-choice-key="effort:${n % 2 ? 'high' : 'max'}"]').click()`);
    if (n % 2) await js("fixture.go('/sessions')");
    else {
      await until("!document.querySelector('.command-panel')", 'picker closed');
      await js("fixture.go('/sessions')");
    }
    await sleep(300);
    assert.equal(
      await js("getComputedStyle(document.querySelector('.route-page')).pointerEvents"),
      'auto',
      'cached page accepts pointer input',
    );
    const before = await js("document.querySelector('.home-scroll').scrollTop");
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 500 }] });
    for (let step = 1; step <= 8; step++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 500 - step * 25 }] });
      await sleep(20);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
    assert.ok(
      (await js("document.querySelector('.home-scroll').scrollTop")) > before,
      'home scrolls after picker closure and navigation',
    );
    await js("fixture.go('/s/fixture')");
    await sleep(250);
  }
  // A separate modal retains its own pointer lock when the picker leaves.
  await openPicker();
  await js('fixture.other.value=true');
  await until('document.body.style.pointerEvents==="none"', 'independent modal lock');
  await js("document.querySelector('.command-close').click()");
  await until("!document.querySelector('.command-panel')", 'picker leaves under another dialog');
  assert.equal(await js('document.body.style.pointerEvents'), 'none', 'closing picker preserves another modal lock');
  await js("document.querySelector('#other-close').click()");
  await until('document.body.style.pointerEvents===""', 'other modal releases its own lock');
  assert.deepEqual(exceptions, [], 'no runtime exceptions');
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        'picker overlay isolation',
        'no global picker lock',
        'selection and immediate route return',
        'native home scrolling',
        'independent modal ownership',
      ],
    }),
  );
} finally {
  ws?.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise((r) => chrome.once('exit', r)), sleep(2000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
