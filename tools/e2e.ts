// E2E driver via Chrome DevTools Protocol (deno: built-in WebSocket + fetch).
// Usage: deno run --allow-net --allow-run --allow-read --allow-write tools/e2e.ts [--mobile]
// Flow: load app → selftest all-green → create webui-v2 session → send
// message → SSE reply lands → fold-block detail → search → new session →
// (mobile viewport) bottom-bar flow. Verifies: zero console errors, zero
// non-local network requests.
const BASE = 'http://127.0.0.1:8790';
const MOBILE = Deno.args.includes('--mobile');
const CHROME = '/usr/bin/google-chrome-stable';
const PORT = 9790 + Math.floor(Math.random() * 100);
const RESULTS: string[] = [];
const FAILS: string[] = [];
function ok(name: string, cond: boolean, detail = '') {
  RESULTS.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) FAILS.push(name);
}
const consoleErrors: string[] = [];
const externalRequests: string[] = [];

// ── launch chrome ────────────────────────────────────────────────────────
const profile = await Deno.makeTempDir();
const chrome = new Deno.Command(CHROME, {
  args: [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    ...(MOBILE ? ['--window-size=390,844', '--touch-events=enabled'] : ['--window-size=1280,860']),
    'about:blank',
  ],
  stdout: 'null', stderr: 'null',
}).spawn();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ws: WebSocket | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await r.json();
      const page = targets.find((t: any) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws!.onopen = res; ws!.onerror = rej; });
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id)!; pending.delete(m.id);
            m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
          } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            consoleErrors.push(m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' '));
          } else if (m.method === 'Runtime.exceptionThrown') {
            consoleErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description ?? ''));
          } else if (m.method === 'Network.requestWillBeSent') {
            const u = new URL(m.params.request.url);
            const host = u.hostname;
            if (!['127.0.0.1', 'localhost'].includes(host)) externalRequests.push(u.href);
          }
        };
        return;
      }
    } catch { /* not up yet */ }
    await wait(200);
  }
  throw new Error('chrome devtools not reachable');
}

async function send(method: string, params: any = {}) {
  const id = ++msgId;
  return new Promise<any>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws!.send(JSON.stringify({ id, method, params }));
  });
}
const sleepLog = console.log;

await connect();
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', MOBILE
  ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
  : { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });

async function evalJs<T>(expr: string): Promise<T> {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails));
  return r.result.value as T;
}
async function goto(hash: string) {
  await send('Page.navigate', { url: BASE + '/#' + hash });
  await wait(700);
}
const click = async (sel: string) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
const type = async (sel: string, text: string) => evalJs(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  el.focus(); el.value = ${JSON.stringify(text)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true; })()`);
const text = (sel: string) => evalJs<string | null>(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const count = (sel: string) => evalJs<number>(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const attr = (sel: string, name: string) => evalJs<string | null>(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const exists = (sel: string) => evalJs<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`);

// ── 1. load + console/network capture ───────────────────────────────────
await send('Page.navigate', { url: BASE + '/' });   // bare load: no hash
await wait(900);
ok('bare load auto-opens sessions (router default)', (await evalJs('location.hash')).startsWith('#/sessions'),
  await evalJs('location.hash'));
await wait(400);
ok('app renders shell', await exists('.shell'));
ok('i18n zh active (html.lang=zh)', (await evalJs('document.documentElement.lang')) === 'zh');
ok('theme attr present', (await evalJs('document.documentElement.dataset.theme')) != null);
ok(`layout=${MOBILE ? 'mobile' : 'desktop'}`, await exists(MOBILE ? '.bbar' : '.vbar'));
{
  const badges = (await evalJs<string>(`[...document.querySelectorAll('.sl-row .badge')].map(b=>b.textContent).join(',')`)) || '';
  ok('list hides transitional storage states (warming/cooling)',
    !/升温|转存|warming|cooling/.test(badges), badges.slice(0, 60));
}
if (!MOBILE) ok('desktop: sessions pane + chat pane', (await exists('.sessions-pane')) && (await exists('.content-pane')));
else {
  const vbarHidden = await evalJs(`getComputedStyle(document.querySelector('.vbar')).display === 'none'`);
  ok('mobile: vbar hidden, bottom bar has all icons', vbarHidden && (await count('.bbar .nav-btn')) >= 3);
}

// ── 2. selftest all green ────────────────────────────────────────────────
await goto('/selftest?auto=1');
let st: any = null;
for (let i = 0; i < 40; i++) {
  st = await evalJs('window.__selftestResult ?? null');
  if (st) break;
  await wait(500);
}
ok('selftest completed', !!st, st ? `pass=${st.pass}/${st.total}` : 'timeout');
if (st) {
  ok('selftest all green', st.allPass, st.results.filter((r: any) => r.status === 'fail').map((r: any) => `${r.key}: ${r.detail}`).join('; '));
  sleepLog(st.results.map((r: any) => `   · ${r.status.padEnd(4)} ${r.key} — ${r.detail ?? ''}`).join('\n'));
}

// ── 3. create webui-v2 session ───────────────────────────────────────────
await goto('/sessions');
await click('.sl-head .btn');
await wait(400);
ok('new-session modal opens', await exists('.modal'));
const providers = await evalJs<any[]>(`[...document.querySelectorAll('.modal select')][0] ? [...document.querySelectorAll('.modal select')[0].options].map(o=>o.value) : []`);
await evalJs(`(() => { const sel = document.querySelectorAll('.modal select')[0]; sel.value = sel.options[0].value; sel.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`);
await wait(600);
const modelOk = await evalJs(`(() => { const sel = document.querySelectorAll('.modal select')[1]; if (!sel || sel.options.length < 2) return false; sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`);
ok('model selectable', modelOk, 'provider=' + (providers[0] || '?'));
await type('.modal input.input', 'webui-v2-e2e' + (MOBILE ? '-mobile' : '-desktop'));
await click('.modal .modal-foot .btn.primary');
await wait(1200);
const chatPath = await evalJs('location.hash');
ok('navigated into new session', chatPath.startsWith('#/s/'), chatPath);
const sid = chatPath.replace('#/s/', '').split('/')[0];
ok('session name shown in topbar', ((await text('.chatbar .title')) || '').includes('webui-v2'));

// ── 4. send message + SSE reply ──────────────────────────────────────────
await type('.composer textarea', '先用 shell 工具运行命令 echo webui-v2-probe,然后只回复命令的输出,不要多余内容。');
await click('.composer .send-btn');
await wait(1000);
ok('optimistic user bubble appears', ((await text('.entry.user .bubble')) || '').includes('webui-v2-probe'),
  ((await text('.entry.user .bubble')) || '').slice(0, 50));
ok('stream indicator or reply starts', await exists('.stream-banner') || await exists('.entry.assistant'));
// wait for reply to reconcile from history (streaming disabled on daemon → completes via fetch)
let replied = false;
for (let i = 0; i < 60; i++) {
  const assistantText = (await evalJs<string>(`[...document.querySelectorAll('.entry.assistant .md')].map(e=>e.textContent).join('')`)) || '';
  if (assistantText.includes('webui-v2-probe')) { replied = true; break; }
  await wait(1000);
}
ok('assistant reply rendered (SSE complete → history reconcile)', replied);

// ── 5. process group: consecutive thinking/tool blocks collapse into ONE
// component; expanding reveals the full sequence (audit ⑤)
{
  const hasGroup = await exists('.proc-group');
  ok('process group chip present', hasGroup, await text('.proc-head'));
  if (hasGroup) {
    await click('.proc-head');
    await wait(300);
    const steps = await count('.proc-steps .proc-step');
    ok('group expands to full sequence', steps >= 2, `steps=${steps}`);
    const stepTypes = (await evalJs<string>(`[...document.querySelectorAll('.proc-step-label')].map(e=>e.textContent).join(' | ')`)) || '';
    ok('sequence contains tool call + result', /工具调用|Tool call/.test(stepTypes) && /工具结果|Tool result/.test(stepTypes), stepTypes.slice(0, 120));
    await click('.proc-head');
    await wait(200);
    ok('group collapses back', !(await exists('.proc-steps')));
  }
  // detail modal still works for standalone chips (trailing tool_call after text)
  if (await exists('.fold-chip')) {
    await click('.fold-chip');
    await wait(300);
    ok('standalone chip detail modal opens', await exists('.modal'));
    await click('.modal-head .btn');
    ok('standalone chip detail modal closes', !(await exists('.modal')));
  }
}

// ── 6. history search ────────────────────────────────────────────────────
// desktop: direct toolbar button; mobile: overflow menu → item (async render, two steps)
const direct = await evalJs(`(() => {
  const b = [...document.querySelectorAll('.chatbar button')].find(b => (b.title || b.getAttribute('aria-label') || '').includes('历史搜索'));
  if (b) { b.click(); return true; } return false; })()`);
let searchOpened = Boolean(direct);
if (!searchOpened) {
  await evalJs(`document.querySelector('.chatbar .menu-wrap button')?.click()`);
  await wait(400);
  searchOpened = await evalJs(`(() => {
    const it = [...document.querySelectorAll('.menu-item')].find(b => b.textContent.includes('历史搜索'));
    if (it) { it.click(); return true; } return false; })()`);
}
ok('search entry reachable', searchOpened);
await wait(500);
await wait(500);
const sheetOpen = (await exists('.drawer')) || (await exists('.sheet-page'));
ok('search sheet opens (drawer on desktop / page on mobile)', sheetOpen);
if (!MOBILE) {
  ok('search drawer keeps chat visible, no scrim',
    (await exists('.chatlog')) && !(await exists('.scrim')));
}
await type('.drawer input[type=search], .sheet-page input[type=search]', 'echo');
await wait(2500);
const srCount = await count('.search-result');
ok('search finds the sent message', srCount > 0, `results=${srCount}`);
await evalJs('history.back()');
await wait(500);
ok('closing search returns to chat', await exists('.chatbar'));

// ── 7. new session again (list flow) ─────────────────────────────────────
await goto('/sessions');
await wait(600);
const rowCount = await count('.sl-row');
ok('session list shows sessions', rowCount > 0, `rows=${rowCount}`);
const rowName = await text('.sl-row .sl-name');
ok('list contains webui-v2 session', (rowName || '').includes('webui-v2'));

// ── 8. theme + i18n toggles still healthy in running app ─────────────────
await goto('/settings');
await wait(500);
ok('settings view renders', await exists('.settings-list'));
await evalJs(`(() => { const b=[...document.querySelectorAll('.seg button')].find(x=>x.textContent.includes('Dark')||x.textContent.includes('夜间')); if(b){b.click();return true;} return false; })()`);
await wait(200);
ok('theme switches to dark', (await evalJs('document.documentElement.dataset.theme')) === 'dark');
await evalJs(`(() => { const b=[...document.querySelectorAll('.seg button')].find(x=>x.textContent==='English'); if(b){b.click();return true;} return false; })()`);
await wait(200);
ok('locale switches to en (html.lang=en)', (await evalJs('document.documentElement.lang')) === 'en');
await evalJs(`(() => { const b=[...document.querySelectorAll('.seg button')].find(x=>x.textContent.includes('中文')); if(b){b.click();return true;} return false; })()`);
await wait(150);

// ── 8b. desktop-only: resize handle + info drawer ───────────────────────
if (!MOBILE) {
  await goto('/sessions');
  await wait(500);
  const wBefore = Number.parseFloat(await evalJs(`getComputedStyle(document.documentElement).getPropertyValue('--w-list')`));
  void wBefore;
  const wAfter = Number.parseFloat(await evalJs(`(() => {
    const h = document.querySelector('.list-resize');
    if (!h) return getComputedStyle(document.documentElement).getPropertyValue('--w-list');
    h.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, button:0, pointerId:1, clientX:356, clientY:400}));
    h.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, pointerId:1, clientX:416, clientY:400}));
    h.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:1, clientX:416, clientY:400}));
    return getComputedStyle(document.documentElement).getPropertyValue('--w-list');
  })()`));
  ok('drag handle resizes list pane', wAfter > wBefore, `${wBefore}px → ${wAfter}px`);
  const persisted = await evalJs(`localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('listWidth'))||'')`);
  ok('resized width persisted', Boolean(persisted), String(persisted));
  // open info from the chat toolbar (real flow), then close back to chat
  await goto(`/s/${sid}`);
  await wait(700);
  await evalJs(`[...document.querySelectorAll('.chatbar button')].find(b => (b.title||'').includes('会话信息'))?.click()`);
  await wait(700);
  ok('info opens as right drawer (chat visible, no scrim)',
    (await exists('.drawer')) && (await exists('.chatlog')) && !(await exists('.scrim')));
  await evalJs(`[...document.querySelectorAll('.drawer-head button')].pop()?.click()`);
  await wait(500);
  ok('drawer close returns to chat', await exists('.chatbar'));
}

// ── 9. mobile-only: bottom bar flow ──────────────────────────────────────
if (MOBILE) {
  await goto('/stats');
  await wait(700);
  ok('mobile stats via bottom bar', await exists('.stats-grid'));
  const bbarBtns = await count('.bbar .nav-btn');
  ok('bottom bar exposes sessions/stats/settings', bbarBtns >= 3, `buttons=${bbarBtns}`);
  await evalJs(`[...document.querySelectorAll('.bbar .nav-btn')][0].click()`);
  await wait(600);
  ok('bottom bar → sessions list page', await exists('.sessions-pane') && !(await exists('.chatbar')));
  // drill into the e2e session then back
  await evalJs(`(() => { const rows=[...document.querySelectorAll('.sl-row')]; const r=rows.find(x=>x.textContent.includes('webui-v2')); if(r){r.click();return true;} return false; })()`);
  await wait(800);
  ok('mobile: chat opens as second-level page', await exists('.chatbar'));
  const hasBack = await exists('.chatbar .btn');
  ok('mobile: back button present in chat bar', hasBack);
  await evalJs(`[...document.querySelectorAll('.chatbar button')][0].click()`);
  await wait(600);
  ok('mobile: back returns to list', await exists('.sessions-pane') && !(await exists('.chatbar')));
}

// ── 10. console + network hygiene ────────────────────────────────────────
await wait(800);
ok('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | ').slice(0, 400));
ok('zero external requests', externalRequests.length === 0, externalRequests.slice(0, 5).join(', '));

// ── report ───────────────────────────────────────────────────────────────
sleepLog('\n════ E2E ' + (MOBILE ? '(mobile viewport)' : '(desktop viewport)') + ' ════');
sleepLog(RESULTS.join('\n'));
sleepLog(`\n${RESULTS.filter(r=>r.startsWith('PASS')).length} passed, ${FAILS.length} failed${RESULTS.filter(r=>r.startsWith('SKIP')).length ? ', ' + RESULTS.filter(r=>r.startsWith('SKIP')).length + ' skipped' : ''}`);
chrome.kill();
Deno.exit(FAILS.length ? 1 : 0);
