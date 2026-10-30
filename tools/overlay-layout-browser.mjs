// The real App shell, with isolated route bodies: cross-breakpoint and close/reopen races.
import assert from 'node:assert/strict';
import { browserFixture } from './browserFixture.mjs';
const html = String.raw`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import App from '/src/App.vue';
import OverlayWindow from '/src/ui/components/OverlayWindow.vue';
import {registerBrowserPlatform} from '/src/platform/browser/index.ts';
import {applyTokens} from '/src/ui/applyTokens.ts';
import '/src/styles/tokens.css';import '/src/styles/base.css';import '/src/styles/layout.css';import '/src/styles/components.css';
registerBrowserPlatform({namespace:'wish-overlay-review',version:1});applyTokens();
const fetchOriginal=window.fetch;
window.fetch=(url,options)=>String(url).includes('/api/')?Promise.resolve(new Response(JSON.stringify({config:{providers:{fixture:{enabled:true,base_url:'http://fixture',path:'/call',auth:'none',models:{fixture:{}}}},defaults:{provider:'fixture',model:'fixture'}},revision:'fixture'}),{headers:{'content-type':'application/json'}})):fetchOriginal(url,options);
const mounts={home:0,settings:0,stats:0},draft=ref('retained draft');
const Home={setup(){mounts.home++;return()=>h('div',{id:'home-surface'},'Home');}};
const Settings={setup(){mounts.settings++;return()=>h(OverlayWindow,{title:'Settings'},()=>h('input',{id:'settings-surface',value:draft.value,onInput:event=>draft.value=event.target.value}));}};
const Stats={setup(){mounts.stats++;return()=>h(OverlayWindow,{title:'Stats'},()=>h('p',{id:'stats-surface'},'Statistics'));}};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/sessions',name:'sessions',meta:{section:'sessions'},component:Home},{path:'/settings',meta:{section:'settings'},component:Settings},{path:'/stats',meta:{section:'stats'},component:Stats}]});
await router.push('/sessions');await router.isReady();createApp(App).use(router).mount('#app');
window.fixture={router,mounts,draft};
</script></body></html>`;
await browserFixture(html, async ({ send, js, until }) => {
  await until('!!document.querySelector("#home-surface")', 'home renders');
  await js('fixture.router.push("/settings")');
  await until('!!document.querySelector("#settings-surface")', 'settings renders');
  for (const width of [899, 900, 390, 1200]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 900 });
    await until(
      `(()=>{const nodes=document.querySelectorAll('#settings-surface');return nodes.length===1&&nodes[0].getBoundingClientRect().width>0;})()`,
      'settings remains usable across breakpoint',
    );
    assert.equal(await js('fixture.mounts.settings'), 1, 'resize does not remount the settings page');
    assert.equal(await js('document.querySelector("#settings-surface").value'), 'retained draft');
  }
  await js('fixture.router.push("/sessions")');
  await js('fixture.router.push("/settings")');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    await js('document.querySelectorAll("#settings-surface").length'),
    1,
    'stale close completion cannot hide a reopened route',
  );
  await js('fixture.router.push("/stats")');
  await until('!!document.querySelector("#stats-surface")', 'other overlay route renders');
  await js('fixture.router.push("/sessions")');
  await until('!document.querySelector("#stats-surface")', 'overlay finishes closing');
  assert.deepEqual(await js('fixture.mounts'), { home: 1, settings: 1, stats: 1 }, 'one instance of each route');
  assert.ok(await js('document.querySelector("#home-surface").getBoundingClientRect().width>0'));
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        'real App responsive overlay',
        'single page instances',
        'draft retention',
        'rapid close/reopen',
        'overlay switching',
        'background retention',
      ],
    }),
  );
});
